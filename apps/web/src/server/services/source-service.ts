import { createRepositoryBundle } from "@relay/db"
import type {
  CreateExternalSourceInput,
  PromoteSourceCitationInput,
  ProjectSourceDto,
  SearchProjectSourcesInput,
  SourceFactCandidateRow,
  SourceSearchResultDto,
} from "@relay/shared"

import { BadRequestError, ForbiddenError, NotFoundError } from "@/server/http/errors"
import { createMemoryItem } from "./memory-service"
import { generateEmbeddings, EMBEDDING_MODEL } from "./embedding-service"
import { resolveViewerEntitlements, consumeQuota } from "./entitlement-service"
import {
  buildSourceObjectKey,
  putEncryptedSourceObject,
} from "./source-storage-service"
import {
  chunkExtractedText,
  estimateTokens,
  extractFactCandidatesFromChunks,
  extractTextFromSourceBuffer,
  fetchExternalSourceText,
  getSourceFileExtension,
  normalizeExternalSourceUrl,
  sha256Hex,
  validateSourceFile,
} from "./source-ingestion-service"

const AUTO_PROMOTE_CONFIDENCE = 0.9

export async function assertSourceUploadAllowed(userId: string, projectId: string, byteSize: number) {
  const repos = createRepositoryBundle(userId)
  const entitlements = await resolveViewerEntitlements(userId)
  if (byteSize > entitlements.limits.sourceFileMaxBytes) {
    throw new ForbiddenError("Source file exceeds your current plan limit.")
  }
  const [sourceCount, storageBytes] = await Promise.all([
    repos.sources.countByProject(projectId),
    repos.sources.sumStorageBytesByUser(userId),
  ])
  if (sourceCount >= entitlements.limits.sourcesPerProject) {
    throw new ForbiddenError("Source limit reached for this project.")
  }
  if (storageBytes + byteSize > entitlements.limits.sourceStorageBytes) {
    throw new ForbiddenError("Source storage limit reached for your current plan.")
  }
  await consumeQuota(userId, "source_ingestion_daily", "day", entitlements.limits.sourceIngestionsDaily, 1, entitlements.plan)
}

export async function listProjectSources(userId: string, projectId: string): Promise<ProjectSourceDto[]> {
  const repos = createRepositoryBundle(userId)
  const sources = await repos.sources.listByProject(projectId)
  const sourceIds = sources.map((s) => s.id)
  const [versionsBySourceId, candidateCountsBySourceId] = await Promise.all([
    repos.sources.getLatestVersionsBySourceIds(sourceIds),
    repos.sources.countFactCandidatesBySourceIds(sourceIds),
  ])
  return sources.map((source) => {
    const counts = candidateCountsBySourceId.get(source.id) ?? { pending: 0, promoted: 0 }
    return {
      ...source,
      latestVersion: versionsBySourceId.get(source.id) ?? null,
      pendingCandidates: counts.pending,
      promotedCandidates: counts.promoted,
    }
  })
}

function getExternalLimit(entitlements: Awaited<ReturnType<typeof resolveViewerEntitlements>>, key: "externalSourcesPerProject" | "externalSourceIndexesDaily" | "externalSourceSearchesDaily" | "externalSourceRefreshesDaily" | "externalSourceMcpActionsPerMinute") {
  const value = entitlements.limits[key]
  if (typeof value === "number") return value
  if (key === "externalSourcesPerProject") return entitlements.limits.sourcesPerProject
  if (key === "externalSourceIndexesDaily") return entitlements.limits.sourceIngestionsDaily
  if (key === "externalSourceSearchesDaily") return entitlements.limits.sourceBackedRecallDaily
  if (key === "externalSourceRefreshesDaily") return Math.max(0, Math.floor(entitlements.limits.sourceIngestionsDaily / 2))
  return 10
}

async function assertExternalSourceIndexAllowed(userId: string, projectId: string, byteSize: number, refresh = false) {
  const repos = createRepositoryBundle(userId)
  const entitlements = await resolveViewerEntitlements(userId)
  const [sourceCount, storageBytes] = await Promise.all([
    repos.sources.countExternalByProject(projectId),
    repos.sources.sumStorageBytesByUser(userId),
  ])
  if (sourceCount >= getExternalLimit(entitlements, "externalSourcesPerProject") && !refresh) {
    throw new ForbiddenError("External source limit reached for this project.")
  }
  if (storageBytes + byteSize > entitlements.limits.sourceStorageBytes) {
    throw new ForbiddenError("Source storage limit reached for your current plan.")
  }
  const dailyKey = refresh ? "external_source_refresh_daily" : "external_source_index_daily"
  const limitKey = refresh ? "externalSourceRefreshesDaily" : "externalSourceIndexesDaily"
  await consumeQuota(userId, dailyKey, "day", getExternalLimit(entitlements, limitKey), 1, entitlements.plan)
}

async function ingestExternalSourceText(userId: string, input: {
  projectId: string
  url: string
  displayName?: string
  sourceType?: CreateExternalSourceInput["sourceType"]
  provider?: string
  refreshPolicy?: string
  fetcher?: typeof fetch
  existingSourceId?: string
  refresh?: boolean
}) {
  const fetched = await fetchExternalSourceText(input.url, { fetcher: input.fetcher })
  await assertExternalSourceIndexAllowed(userId, input.projectId, fetched.byteSize, input.refresh === true)

  const repos = createRepositoryBundle(userId)
  const canonicalUrl = normalizeExternalSourceUrl(fetched.canonicalUrl)
  const existing = input.existingSourceId
    ? await repos.sources.getById(input.existingSourceId)
    : await repos.sources.findBySourceUri(input.projectId, canonicalUrl)
  if (existing && existing.projectId !== input.projectId) throw new NotFoundError("Source not found.")
  if (existing && !input.refresh) {
    return getProjectSourceDetail(userId, input.projectId, existing.id)
  }

  const contentHash = sha256Hex(fetched.text)
  const metadata = {
    external: {
      kind: "external_docs",
      provider: input.provider ?? "relay",
      canonicalUrl,
      sourceType: input.sourceType ?? fetched.metadata.sourceType ?? "website",
      refreshPolicy: input.refreshPolicy ?? "manual",
      crawlStats: {
        pages: 1,
        byteSize: fetched.byteSize,
        tokenEstimate: estimateTokens(fetched.text),
      },
    },
    extraction: fetched.metadata,
  }
  const source = existing ?? await repos.sources.create(userId, {
    projectId: input.projectId,
    kind: "external_docs",
    displayName: input.displayName ?? fetched.displayName,
    mimeType: fetched.mimeType,
    byteSize: fetched.byteSize,
    contentHash,
    sourceUri: canonicalUrl,
    metadata,
  })
  if (existing) {
    await repos.sources.updateSourceStatus(existing.id, "processing", { metadata })
  }
  const version = await repos.sources.createVersion(userId, {
    sourceId: source.id,
    projectId: input.projectId,
    contentHash,
    byteSize: fetched.byteSize,
    metadata,
  })
  const chunkDrafts = chunkExtractedText(fetched.text, { sourceId: source.id, versionId: version.id })
  const chunks = await repos.sources.createChunks(chunkDrafts.map((chunk) => ({
    ...chunk,
    projectId: input.projectId,
    locator: {
      ...chunk.locator,
      url: canonicalUrl,
    },
    metadata: {
      ...chunk.metadata,
      provider: input.provider ?? "relay",
      sourceType: metadata.external.sourceType,
    },
  })))
  const tokenEstimate = estimateTokens(fetched.text)
  await consumeQuota(
    userId,
    "source_embedded_tokens_monthly",
    "month",
    (await resolveViewerEntitlements(userId)).limits.sourceEmbeddedTokensMonthly,
    tokenEstimate,
    (await resolveViewerEntitlements(userId)).plan,
  )
  await repos.sources.markVersionReady(version.id, {
    extractedTextHash: sha256Hex(fetched.text),
    extractedTextBytes: Buffer.byteLength(fetched.text, "utf8"),
    chunkCount: chunks.length,
    tokenEstimate,
    metadata: fetched.metadata,
  })
  await repos.sources.updateSourceStatus(source.id, "ready", { metadata })
  await embedSourceChunksIfConfigured(userId, chunks)
  return getProjectSourceDetail(userId, input.projectId, source.id)
}

export async function createExternalSource(userId: string, input: CreateExternalSourceInput & {
  projectId: string
  fetcher?: typeof fetch
}) {
  return ingestExternalSourceText(userId, input)
}

export async function refreshExternalSource(userId: string, projectId: string, sourceId: string, options: { fetcher?: typeof fetch } = {}) {
  const repos = createRepositoryBundle(userId)
  const source = await repos.sources.getById(sourceId)
  if (!source || source.projectId !== projectId) throw new NotFoundError("Source not found.")
  if (!source.sourceUri) throw new BadRequestError("Only external URL sources can be refreshed.")
  return ingestExternalSourceText(userId, {
    projectId,
    url: source.sourceUri,
    displayName: source.displayName,
    existingSourceId: source.id,
    refresh: true,
    fetcher: options.fetcher,
  })
}

export async function searchProjectSources(userId: string, projectId: string, input: SearchProjectSourcesInput): Promise<{ results: SourceSearchResultDto[] }> {
  const entitlements = await resolveViewerEntitlements(userId)
  await consumeQuota(userId, "external_source_search_daily", "day", getExternalLimit(entitlements, "externalSourceSearchesDaily"), 1, entitlements.plan)
  await consumeQuota(userId, "source_backed_recall_daily", "day", entitlements.limits.sourceBackedRecallDaily, 1, entitlements.plan)
  const repos = createRepositoryBundle(userId)
  const results = await repos.sources.searchChunks(projectId, {
    query: input.query,
    sourceId: input.sourceId,
    kinds: input.kinds,
    limit: input.limit,
  })
  return {
    results: results.map((item) => ({
      sourceId: item.sourceId,
      sourceKind: item.sourceKind,
      sourceTitle: item.sourceTitle,
      sourceUrl: item.sourceUrl,
      chunkId: item.chunkId,
      versionId: item.versionId,
      content: item.content,
      locator: item.locator,
      provider: item.provider,
      score: item.score,
      indexedAt: item.indexedAt,
    })),
  }
}

export async function getProjectSourceDetail(userId: string, projectId: string, sourceId: string) {
  const repos = createRepositoryBundle(userId)
  const source = await repos.sources.getById(sourceId)
  if (!source || source.projectId !== projectId) throw new NotFoundError("Source not found.")
  const [latestVersion, chunks, candidates] = await Promise.all([
    repos.sources.getLatestVersion(sourceId),
    repos.sources.listChunks(sourceId, { limit: 20 }),
    repos.sources.listFactCandidates(sourceId),
  ])
  return { source, latestVersion, chunks, candidates }
}

export async function archiveProjectSource(userId: string, projectId: string, sourceId: string) {
  const repos = createRepositoryBundle(userId)
  const source = await repos.sources.getById(sourceId)
  if (!source || source.projectId !== projectId) throw new NotFoundError("Source not found.")
  return repos.sources.updateSourceStatus(sourceId, "archived")
}

async function embedSourceChunksIfConfigured(userId: string, chunks: Array<{ id: string; content: string }>) {
  if (chunks.length === 0) return 0
  try {
    const repos = createRepositoryBundle(userId)
    const embeddings = await generateEmbeddings(chunks.map((chunk) => chunk.content), "RETRIEVAL_DOCUMENT")
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]
      const embedding = embeddings[i]
      if (!chunk || !embedding) continue
      await repos.provider.query(
        `update source_chunks set embedding = $2::vector, embedding_model = $3 where id = $1`,
        [chunk.id, `[${embedding.join(",")}]`, EMBEDDING_MODEL],
      )
    }
    return embeddings.length
  } catch {
    return 0
  }
}

export async function createSourceFromUpload(userId: string, input: {
  projectId: string
  fileName: string
  mimeType: string
  buffer: Buffer
}) {
  const validated = validateSourceFile({
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: input.buffer.byteLength,
    maxBytes: (await resolveViewerEntitlements(userId)).limits.sourceFileMaxBytes,
  })
  await assertSourceUploadAllowed(userId, input.projectId, input.buffer.byteLength)

  const repos = createRepositoryBundle(userId)
  const contentHash = sha256Hex(input.buffer)
  const source = await repos.sources.create(userId, {
    projectId: input.projectId,
    kind: "uploaded_file",
    displayName: input.fileName,
    originalFileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: input.buffer.byteLength,
    contentHash,
    metadata: { extension: validated.extension, format: validated.format },
  })
  const version = await repos.sources.createVersion(userId, {
    sourceId: source.id,
    projectId: input.projectId,
    contentHash,
    byteSize: input.buffer.byteLength,
    metadata: { fileName: input.fileName },
  })
  const objectKey = buildSourceObjectKey({
    projectId: input.projectId,
    sourceId: source.id,
    versionId: version.id,
    extension: getSourceFileExtension(input.fileName),
  })

  if (process.env.RELAY_SOURCE_STORAGE_MODE !== "memory") {
    await putEncryptedSourceObject({
      key: objectKey,
      buffer: input.buffer,
      contentType: input.mimeType,
      crypto: { projectId: input.projectId, sourceId: source.id, versionId: version.id },
    })
  }
  await repos.sources.updateSourceObjectKey(source.id, objectKey)

  try {
    const extracted = await extractTextFromSourceBuffer({
      buffer: input.buffer,
      fileName: input.fileName,
      mimeType: input.mimeType,
    })
    if (!extracted.text) {
      throw new BadRequestError("Relay could not extract text from this source.")
    }
    const chunkDrafts = chunkExtractedText(extracted.text, { sourceId: source.id, versionId: version.id })
    const chunks = await repos.sources.createChunks(chunkDrafts.map((chunk) => ({
      ...chunk,
      projectId: input.projectId,
    })))
    const candidates = extractFactCandidatesFromChunks(chunks, input.projectId)
    await repos.sources.createFactCandidates(candidates)
    await repos.sources.markVersionReady(version.id, {
      extractedTextHash: sha256Hex(extracted.text),
      extractedTextBytes: Buffer.byteLength(extracted.text, "utf8"),
      chunkCount: chunks.length,
      tokenEstimate: estimateTokens(extracted.text),
      metadata: extracted.metadata,
    })
    await repos.sources.updateSourceStatus(source.id, "ready", {
      metadata: { ...source.metadata, storageObjectKey: objectKey, extraction: extracted.metadata },
    })
    await embedSourceChunksIfConfigured(userId, chunks)
    await promoteHighConfidenceSourceFacts(userId, source.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source ingestion failed."
    await repos.sources.markVersionFailed(version.id, message)
    await repos.sources.updateSourceStatus(source.id, "failed", { metadata: { ...source.metadata, error: message } })
  }

  return getProjectSourceDetail(userId, input.projectId, source.id)
}

export async function promoteHighConfidenceSourceFacts(userId: string, sourceId: string) {
  const repos = createRepositoryBundle(userId)
  const candidates = await repos.sources.listPendingFactCandidates(sourceId)
  let promoted = 0

  for (const candidate of candidates) {
    if (candidate.confidence < AUTO_PROMOTE_CONFIDENCE) continue
    const memory = await createMemoryItem(userId, {
      projectId: candidate.projectId,
      type: candidate.type,
      title: candidate.title,
      content: candidate.content,
      pinned: false,
      tags: ["source"],
      sourceSurface: "web",
      capturedAt: candidate.createdAt,
      metadata: {
        ...candidate.metadata,
        sourceId: candidate.sourceId,
        sourceVersionId: candidate.versionId,
        sourceFactCandidateId: candidate.id,
      },
    })
    await repos.sources.markFactCandidatePromoted(candidate.id, memory.id)
    await repos.sources.linkMemory({
      sourceId: candidate.sourceId,
      versionId: candidate.versionId,
      chunkId: candidate.chunkId,
      memoryItemId: memory.id,
      confidence: candidate.confidence,
    })
    promoted += 1
  }

  return { promoted, reviewed: candidates.length }
}

export async function promoteSourceCitation(userId: string, projectId: string, sourceId: string, input: PromoteSourceCitationInput) {
  const repos = createRepositoryBundle(userId)
  const source = await repos.sources.getById(sourceId)
  if (!source || source.projectId !== projectId) throw new NotFoundError("Source not found.")
  const chunk = await repos.sources.getChunkById(input.chunkId)
  if (!chunk || chunk.sourceId !== sourceId || chunk.projectId !== projectId) throw new NotFoundError("Source citation not found.")

  const memory = await createMemoryItem(userId, {
    projectId,
    type: input.type,
    title: input.title ?? source.displayName,
    content: input.content,
    tags: ["source", "external-source"],
    sourceSurface: "web",
    sourceUrl: source.sourceUri,
    capturedAt: new Date().toISOString(),
    metadata: {
      sourceId,
      sourceVersionId: chunk.versionId,
      sourceChunkId: chunk.id,
      sourceLocator: chunk.locator,
      promotedFromExternalSource: true,
    },
  })
  await repos.sources.linkMemory({
    sourceId,
    versionId: chunk.versionId,
    chunkId: chunk.id,
    memoryItemId: memory.id,
    confidence: 1,
  })
  return { memoryItemId: memory.id }
}

export async function reviewSourceFactCandidate(userId: string, projectId: string, sourceId: string, candidateId: string, action: "promote" | "reject") {
  const repos = createRepositoryBundle(userId)
  const source = await repos.sources.getById(sourceId)
  if (!source || source.projectId !== projectId) throw new NotFoundError("Source not found.")
  const candidates = await repos.sources.listFactCandidates(sourceId)
  const candidate = candidates.find((item: SourceFactCandidateRow) => item.id === candidateId)
  if (!candidate) throw new NotFoundError("Source candidate not found.")
  if (action === "reject") {
    await repos.sources.rejectFactCandidate(candidateId)
    return { status: "rejected" as const }
  }
  if (candidate.status === "promoted" && candidate.memoryItemId) {
    return { status: "promoted" as const, memoryItemId: candidate.memoryItemId }
  }
  const memory = await createMemoryItem(userId, {
    projectId,
    type: candidate.type,
    title: candidate.title,
    content: candidate.content,
    tags: ["source"],
    sourceSurface: "web",
    capturedAt: candidate.createdAt,
    metadata: {
      ...candidate.metadata,
      sourceId,
      sourceVersionId: candidate.versionId,
      sourceFactCandidateId: candidate.id,
      reviewedByUser: true,
    },
  })
  await repos.sources.markFactCandidatePromoted(candidateId, memory.id)
  await repos.sources.linkMemory({
    sourceId,
    versionId: candidate.versionId,
    chunkId: candidate.chunkId,
    memoryItemId: memory.id,
    confidence: candidate.confidence,
  })
  return { status: "promoted" as const, memoryItemId: memory.id }
}
