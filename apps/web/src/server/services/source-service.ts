import { createRepositoryBundle, createWorkerRepositoryBundle } from "@relay/db"
import type { SourceChunkSearchResult } from "@relay/db"
import type {
  ContextPackProjectSourcesInput,
  CreateExternalSourceInput,
  ExploreProjectSourcesInput,
  GrepProjectSourcesInput,
  ImportSourceCitationsInput,
  PromoteSourceCitationInput,
  ProjectSourceDto,
  SearchProjectSourcesInput,
  SourceFactCandidateRow,
  SourceSearchResultDto,
} from "@relay/shared"

import { BadRequestError, ForbiddenError, NotFoundError } from "@/server/http/errors"
import { invalidateProjectCache, invalidateProjectSourceCache } from "@/server/cache/invalidation"
import type { DnsLookup } from "@/server/lib/safe-url"
import { createMemoryItem } from "./memory-service"
import { generateEmbedding, generateEmbeddings, EMBEDDING_MODEL } from "./embedding-service"
import { resolveViewerEntitlements, consumeQuota } from "./entitlement-service"
import {
  buildSourceObjectKey,
  deleteSourceObject,
  getDecryptedSourceObject,
  putEncryptedSourceObject,
} from "./source-storage-service"
import {
  chunkExtractedText,
  classifyExternalSourceUrl,
  estimateTokens,
  extractFactCandidatesFromChunks,
  extractTextFromSourceBuffer,
  fetchExternalSourceText,
  getSourceFileExtension,
  normalizeExternalSourceUrl,
  sha256Hex,
  validateSourceFile,
} from "./source-ingestion-service"
import { crawlExternalSourcePages, type CrawledSourcePage } from "./source-crawl-service"

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
  const [versionsBySourceId, candidateCountsBySourceId, memoryCountsBySourceId] = await Promise.all([
    repos.sources.getLatestVersionsBySourceIds(sourceIds),
    repos.sources.countFactCandidatesBySourceIds(sourceIds),
    repos.sources.countMemoryLinksBySourceIds(sourceIds),
  ])
  return sources.map((source) => {
    const counts = candidateCountsBySourceId.get(source.id) ?? { pending: 0, promoted: 0 }
    const latestVersion = versionsBySourceId.get(source.id) ?? null
    const lifecycleMetadata = {
      ...source.metadata,
      lastIndexedAt: latestVersion?.createdAt ?? source.createdAt,
      lastRefreshedAt: source.metadata.lastRefreshedAt ?? null,
      refreshPolicy: source.metadata.external && typeof source.metadata.external === "object"
        ? (source.metadata.external as Record<string, unknown>).refreshPolicy ?? "manual"
        : "manual",
      contentHash: source.contentHash,
      staleReason: source.staleReason,
      derivedMemoryCount: memoryCountsBySourceId.get(source.id) ?? 0,
    }
    return {
      ...source,
      metadata: lifecycleMetadata,
      latestVersion,
      pendingCandidates: counts.pending,
      promotedCandidates: counts.promoted,
      derivedMemoryCount: memoryCountsBySourceId.get(source.id) ?? 0,
    }
  })
}

type ViewerEntitlements = Awaited<ReturnType<typeof resolveViewerEntitlements>>

// Count + daily-quota gate, run BEFORE the outbound fetch so the rate limit
// actually protects the fetch surface.
async function assertExternalSourceIndexQuota(
  userId: string,
  projectId: string,
  entitlements: ViewerEntitlements,
  refresh: boolean,
) {
  if (!refresh) {
    const sourceCount = await createRepositoryBundle(userId).sources.countExternalByProject(projectId)
    if (sourceCount >= entitlements.limits.externalSourcesPerProject) {
      throw new ForbiddenError("External source limit reached for this project.")
    }
  }
  const dailyKey = refresh ? "external_source_refresh_daily" : "external_source_index_daily"
  const dailyLimit = refresh
    ? entitlements.limits.externalSourceRefreshesDaily
    : entitlements.limits.externalSourceIndexesDaily
  await consumeQuota(userId, dailyKey, "day", dailyLimit, 1, entitlements.plan)
}

// Storage gate, run AFTER the fetch since it needs the fetched byte size.
async function assertExternalSourceStorage(
  userId: string,
  entitlements: ViewerEntitlements,
  byteSize: number,
) {
  const storageBytes = await createRepositoryBundle(userId).sources.sumStorageBytesByUser(userId)
  if (storageBytes + byteSize > entitlements.limits.sourceStorageBytes) {
    throw new ForbiddenError("Source storage limit reached for your current plan.")
  }
}

async function ingestExternalSourceText(userId: string, input: {
  projectId: string
  url: string
  displayName?: string
  sourceType?: CreateExternalSourceInput["sourceType"]
  refreshPolicy?: string
  fetcher?: typeof fetch
  lookup?: DnsLookup
  existingSourceId?: string
  refresh?: boolean
}) {
  const entitlements = await resolveViewerEntitlements(userId)
  await assertExternalSourceIndexQuota(userId, input.projectId, entitlements, input.refresh === true)
  const classifiedType = classifyExternalSourceUrl(input.url)
  let crawledPages: CrawledSourcePage[]
  if (classifiedType === "pdf" || classifiedType === "arxiv") {
    const single = await fetchExternalSourceText(input.url, { fetcher: input.fetcher, lookup: input.lookup })
    crawledPages = [{
      url: single.canonicalUrl,
      canonicalUrl: single.canonicalUrl,
      title: single.displayName,
      headingPath: [single.displayName],
      content: single.text,
      contentHash: sha256Hex(single.text),
      contentType: single.mimeType,
      etag: null,
      lastModified: null,
      metadata: single.metadata,
    }]
  } else {
    crawledPages = await crawlExternalSourcePages(input.url, {
      fetcher: input.fetcher,
      lookup: input.lookup,
      maxPages: entitlements.limits.externalSourcePagesPerSource,
    })
  }
  if (crawledPages.length === 0) throw new BadRequestError("Relay could not extract text from this external source.")
  const combinedText = crawledPages.map((page) => `# ${page.title ?? page.url}\n\n${page.content}`).join("\n\n---\n\n")
  const firstPage = crawledPages[0]!
  const fetched = {
    text: combinedText,
    canonicalUrl: firstPage.canonicalUrl,
    displayName: firstPage.title ?? new URL(firstPage.url).hostname,
    mimeType: firstPage.contentType,
    byteSize: Buffer.byteLength(combinedText, "utf8"),
    metadata: {
      sourceType: input.sourceType ?? classifiedType,
      fetcher: "relay-native-crawl-v1",
      pages: crawledPages.length,
    },
  }
  await assertExternalSourceStorage(userId, entitlements, fetched.byteSize)

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
  const previousContentHash = existing?.contentHash ?? null
  const contentChanged = Boolean(input.refresh && existing && previousContentHash && previousContentHash !== contentHash)
  const nowIso = new Date().toISOString()
  const existingExternal = existing?.metadata.external && typeof existing.metadata.external === "object"
    ? existing.metadata.external as Record<string, unknown>
    : {}
  const metadata = {
    ...existing?.metadata,
    external: {
      ...existingExternal,
      kind: "external_docs",
      provider: "relay",
      canonicalUrl,
      sourceType: input.sourceType ?? fetched.metadata.sourceType ?? "website",
      refreshPolicy: input.refreshPolicy ?? existingExternal.refreshPolicy ?? "manual",
      crawlStats: {
        pages: crawledPages.length,
        byteSize: fetched.byteSize,
        tokenEstimate: estimateTokens(fetched.text),
      },
    },
    lastIndexedAt: existing?.metadata.lastIndexedAt ?? nowIso,
    lastRefreshedAt: input.refresh ? nowIso : existing?.metadata.lastRefreshedAt ?? null,
    contentHash,
    staleReason: null,
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
  const job = await repos.sources.createIndexJob(userId, {
    sourceId: source.id,
    projectId: input.projectId,
    kind: input.refresh ? "refresh" : "index",
    pagesTotal: crawledPages.length,
    metadata: { canonicalUrl, sourceType: metadata.external.sourceType },
  })
  await repos.sources.updateIndexJob(job.id, { status: "running", progress: 0.1, pagesTotal: crawledPages.length })
  const version = await repos.sources.createVersion(userId, {
    sourceId: source.id,
    projectId: input.projectId,
    contentHash,
    byteSize: fetched.byteSize,
    metadata,
  })
  try {
    await repos.sources.upsertSourcePages(crawledPages.map((page) => ({
      sourceId: source.id,
      versionId: version.id,
      projectId: input.projectId,
      url: page.url,
      canonicalUrl: page.canonicalUrl,
      title: page.title,
      headingPath: page.headingPath,
      content: page.content,
      contentHash: page.contentHash,
      contentType: page.contentType,
      etag: page.etag,
      lastModified: page.lastModified,
      metadata: page.metadata,
    })))
    let nextChunkIndex = 0
    const chunkDrafts = crawledPages.flatMap((page) => (
      chunkExtractedText(page.content, { sourceId: source.id, versionId: version.id })
        .map((chunk) => ({
          ...chunk,
          chunkIndex: nextChunkIndex++,
          locator: {
            ...chunk.locator,
            pageUrl: page.url,
            pageTitle: page.title,
            headingPath: page.headingPath,
          },
          metadata: {
            ...chunk.metadata,
            pageContentHash: page.contentHash,
          },
        }))
    ))
    const chunks = await repos.sources.createChunks(chunkDrafts.map((chunk) => ({
      ...chunk,
      projectId: input.projectId,
      locator: {
        ...chunk.locator,
        url: canonicalUrl,
      },
      metadata: {
        ...chunk.metadata,
        provider: "relay",
        sourceType: metadata.external.sourceType,
      },
    })))
    const tokenEstimate = estimateTokens(fetched.text)
    await consumeQuota(
      userId,
      "source_embedded_tokens_monthly",
      "month",
      entitlements.limits.sourceEmbeddedTokensMonthly,
      tokenEstimate,
      entitlements.plan,
    )
    await repos.sources.markVersionReady(version.id, {
      extractedTextHash: sha256Hex(fetched.text),
      extractedTextBytes: Buffer.byteLength(fetched.text, "utf8"),
      chunkCount: chunks.length,
      tokenEstimate,
      metadata: fetched.metadata,
    })
    await repos.sources.updateSourceStatus(source.id, "ready", { metadata, contentHash, byteSize: fetched.byteSize, staleReason: null })
    await repos.sources.updateIndexJob(job.id, {
      status: "ready",
      progress: 1,
      pagesTotal: crawledPages.length,
      pagesIndexed: crawledPages.length,
      metadata: { canonicalUrl, sourceType: metadata.external.sourceType, chunkCount: chunks.length },
    })
    try {
      const globalSource = await repos.sources.upsertGlobalSource({
        sourceType: metadata.external.sourceType === "github_repo" ? "repository" : "documentation",
        canonicalUrl,
        displayName: input.displayName ?? fetched.displayName,
        trustScore: 0.5,
        metadata: { sourceType: metadata.external.sourceType, lastIndexedAt: nowIso },
      })
      await repos.sources.linkGlobalSourceToProject({
        projectId: input.projectId,
        globalSourceId: globalSource.id,
        projectSourceId: source.id,
        metadata: { linkedAt: nowIso },
      })
    } catch {
      // Global source reuse is opportunistic; project-local indexing remains authoritative.
    }
    if (contentChanged) {
      await repos.sources.markLinkedMemoriesPotentiallyStale(source.id, {
        sourceVersionId: version.id,
        previousContentHash,
        contentHash,
        changedAt: nowIso,
      })
    }
    await embedSourceChunksIfConfigured(userId, chunks)
  } catch (error) {
    const message = error instanceof Error ? error.message : "External source ingestion failed."
    await repos.sources.markVersionFailed(version.id, message)
    await repos.sources.updateIndexJob(job.id, { status: "failed", errorMessage: message }).catch(() => undefined)
    await repos.sources.updateSourceStatus(source.id, "failed", { metadata: { ...metadata, error: message } })
  }
  invalidateProjectSourceCache(userId, input.projectId, source.id)
  return getProjectSourceDetail(userId, input.projectId, source.id)
}

export async function createExternalSource(userId: string, input: CreateExternalSourceInput & {
  projectId: string
  fetcher?: typeof fetch
  lookup?: DnsLookup
}) {
  return ingestExternalSourceText(userId, input)
}

export async function refreshExternalSource(userId: string, projectId: string, sourceId: string, options: { fetcher?: typeof fetch; lookup?: DnsLookup } = {}) {
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
    lookup: options.lookup,
  })
}

export async function searchProjectSources(userId: string, projectId: string, input: SearchProjectSourcesInput): Promise<{ results: SourceSearchResultDto[] }> {
  const entitlements = await resolveViewerEntitlements(userId)
  await consumeQuota(userId, "external_source_search_daily", "day", entitlements.limits.externalSourceSearchesDaily, 1, entitlements.plan)
  const repos = createRepositoryBundle(userId)
  let queryEmbedding: number[] | undefined
  try {
    queryEmbedding = await generateEmbedding(input.query, "RETRIEVAL_QUERY")
  } catch {
    queryEmbedding = undefined
  }
  const results = await repos.sources.searchChunks(projectId, {
    query: input.query,
    sourceId: input.sourceId,
    kinds: input.kinds,
    queryEmbedding,
    limit: input.limit,
  })
  return { results: results.map(sourceSearchResultToDto) }
}

function sourceSearchResultToDto(item: SourceChunkSearchResult): SourceSearchResultDto {
  const locator = item.locator ?? {}
  const metadata = item.metadata ?? {}
  const pageUrl = typeof locator.pageUrl === "string" ? locator.pageUrl : null
  const pageTitle = typeof locator.pageTitle === "string" ? locator.pageTitle : null
  const contentHash = typeof metadata.pageContentHash === "string" ? metadata.pageContentHash : null
  return {
    sourceId: item.sourceId,
    sourceKind: item.sourceKind,
    sourceTitle: item.sourceTitle,
    sourceUrl: item.sourceUrl,
    chunkId: item.chunkId,
    versionId: item.versionId,
    content: item.content,
    locator,
    provider: item.provider,
    score: item.score,
    indexedAt: item.indexedAt,
    citation: {
      source: item.sourceTitle,
      url: pageUrl ?? item.sourceUrl,
      title: pageTitle ?? item.sourceTitle,
      chunkId: item.chunkId,
      indexedAt: item.indexedAt,
      contentHash,
      stale: metadata.potentiallyStale === true,
      score: item.score,
    },
  } as SourceSearchResultDto
}

function citationFromResult(item: SourceChunkSearchResult) {
  const locator = item.locator ?? {}
  const metadata = item.metadata ?? {}
  const pageUrl = typeof locator.pageUrl === "string" ? locator.pageUrl : item.sourceUrl
  const pageTitle = typeof locator.pageTitle === "string" ? locator.pageTitle : item.sourceTitle
  return {
    sourceId: item.sourceId,
    sourceTitle: item.sourceTitle,
    pageUrl,
    title: pageTitle,
    chunkId: item.chunkId,
    versionId: item.versionId,
    locator,
    indexedAt: item.indexedAt,
    contentHash: typeof metadata.pageContentHash === "string" ? metadata.pageContentHash : null,
    score: item.score,
    stale: metadata.potentiallyStale === true,
  }
}

export async function exploreProjectSources(_userId: string, projectId: string, input: ExploreProjectSourcesInput) {
  const repos = createRepositoryBundle(_userId)
  const pages = await repos.sources.listSourcePages(projectId, {
    sourceId: input.sourceId,
    limit: input.limit,
  })
  return {
    pages: pages.map((page) => ({
      pageId: page.id,
      sourceId: page.sourceId,
      url: page.url,
      canonicalUrl: page.canonicalUrl,
      title: page.title,
      headingPath: page.headingPath,
      contentHash: page.contentHash,
      contentType: page.contentType,
      updatedAt: page.updatedAt,
    })),
  }
}

export async function grepProjectSources(userId: string, projectId: string, input: GrepProjectSourcesInput): Promise<{ results: SourceSearchResultDto[] }> {
  const entitlements = await resolveViewerEntitlements(userId)
  await consumeQuota(userId, "external_source_search_daily", "day", entitlements.limits.externalSourceSearchesDaily, 1, entitlements.plan)
  const repos = createRepositoryBundle(userId)
  const results = await repos.sources.grepChunks(projectId, {
    query: input.query,
    limit: input.limit,
    sourceId: input.sourceId,
  })
  return { results: results.map(sourceSearchResultToDto) }
}

export async function buildSourceContextPack(userId: string, projectId: string, input: ContextPackProjectSourcesInput) {
  const entitlements = await resolveViewerEntitlements(userId)
  await consumeQuota(userId, "external_source_search_daily", "day", entitlements.limits.externalSourceSearchesDaily, 1, entitlements.plan)
  const repos = createRepositoryBundle(userId)
  let queryEmbedding: number[] | undefined
  try {
    queryEmbedding = await generateEmbedding(input.query, "RETRIEVAL_QUERY")
  } catch {
    queryEmbedding = undefined
  }
  const results = await repos.sources.searchChunks(projectId, {
    query: input.query,
    sourceId: input.sourceId,
    queryEmbedding,
    limit: input.limit,
  })
  const snippets: Array<{
    sourceId: string
    sourceTitle: string
    sourceUrl: string | null
    chunkId: string
    versionId: string
    content: string
    locator: Record<string, unknown>
    score: number
    indexedAt: string | null
  }> = []
  const citations: ReturnType<typeof citationFromResult>[] = []
  const seen = new Set<string>()
  let tokenEstimate = 0
  const warnings: string[] = []
  for (const result of results) {
    if (seen.has(result.chunkId)) continue
    seen.add(result.chunkId)
    const tokens = estimateTokens(result.content)
    if (tokenEstimate + tokens > input.tokenBudget) {
      warnings.push("Some matching snippets were omitted because they exceeded the context-pack token budget.")
      continue
    }
    tokenEstimate += tokens
    snippets.push({
      sourceId: result.sourceId,
      sourceTitle: result.sourceTitle,
      sourceUrl: result.sourceUrl,
      chunkId: result.chunkId,
      versionId: result.versionId,
      content: result.content,
      locator: result.locator,
      score: result.score,
      indexedAt: result.indexedAt,
    })
    citations.push(citationFromResult(result))
  }
  return {
    query: input.query,
    tokenBudget: input.tokenBudget,
    tokenEstimate,
    snippets,
    citations,
    warnings: Array.from(new Set(warnings)),
  }
}

export async function importSourceCitations(userId: string, projectId: string, input: ImportSourceCitationsInput) {
  const entitlements = await resolveViewerEntitlements(userId)
  await consumeQuota(userId, "external_source_index_daily", "day", entitlements.limits.externalSourceIndexesDaily, 1, entitlements.plan)
  const repos = createRepositoryBundle(userId)
  const first = input.citations[0]
  if (!first) throw new BadRequestError("At least one citation is required.")
  const combinedText = input.citations
    .map((citation) => `# ${citation.title}\n${citation.url}\n\n${citation.content}`)
    .join("\n\n---\n\n")
  const contentHash = sha256Hex(combinedText)
  const nowIso = new Date().toISOString()
  const metadata = {
    externalImport: {
      provider: input.provider,
      providerSourceId: input.providerSourceId ?? null,
      citationCount: input.citations.length,
      importedAt: nowIso,
    },
    external: {
      kind: "external_docs",
      provider: "relay",
      sourceType: "external_import",
      refreshPolicy: "manual",
    },
    contentHash,
  }
  const source = await repos.sources.create(userId, {
    projectId,
    kind: "external_docs",
    displayName: input.displayName ?? first.title,
    mimeType: "text/markdown",
    byteSize: Buffer.byteLength(combinedText, "utf8"),
    contentHash,
    sourceUri: first.url,
    metadata,
  })
  const job = await repos.sources.createIndexJob(userId, {
    sourceId: source.id,
    projectId,
    kind: "import",
    pagesTotal: input.citations.length,
    metadata: metadata.externalImport,
  })
  await repos.sources.updateIndexJob(job.id, { status: "running", progress: 0.1, pagesTotal: input.citations.length })
  const version = await repos.sources.createVersion(userId, {
    sourceId: source.id,
    projectId,
    contentHash,
    byteSize: Buffer.byteLength(combinedText, "utf8"),
    metadata,
  })
  try {
    const chunks = await repos.sources.createChunks(input.citations.map((citation, index) => ({
      sourceId: source.id,
      versionId: version.id,
      projectId,
      chunkIndex: index,
      content: citation.content,
      tokenEstimate: estimateTokens(citation.content),
      locator: {
        ...(citation.locator ?? {}),
        pageUrl: citation.url,
        pageTitle: citation.title,
      },
      metadata: {
        importedProvider: input.provider,
        providerSourceId: input.providerSourceId ?? null,
        pageContentHash: sha256Hex(citation.content),
      },
    })))
    await repos.sources.createExternalCitations(input.citations.map((citation, index) => ({
      projectId,
      sourceId: source.id,
      versionId: version.id,
      chunkId: chunks[index]?.id ?? null,
      provider: input.provider,
      providerSourceId: input.providerSourceId ?? null,
      title: citation.title,
      url: citation.url,
      contentHash: sha256Hex(citation.content),
      locator: citation.locator ?? {},
      metadata: { importedAt: nowIso },
    })))
    const tokenEstimate = estimateTokens(combinedText)
    await repos.sources.markVersionReady(version.id, {
      extractedTextHash: contentHash,
      extractedTextBytes: Buffer.byteLength(combinedText, "utf8"),
      chunkCount: chunks.length,
      tokenEstimate,
      metadata,
    })
    await repos.sources.updateSourceStatus(source.id, "ready", { metadata, contentHash, byteSize: Buffer.byteLength(combinedText, "utf8") })
    await repos.sources.updateIndexJob(job.id, {
      status: "ready",
      progress: 1,
      pagesTotal: input.citations.length,
      pagesIndexed: input.citations.length,
      metadata: { ...metadata.externalImport, chunkCount: chunks.length },
    })
    await embedSourceChunksIfConfigured(userId, chunks)
  } catch (error) {
    const message = error instanceof Error ? error.message : "External citation import failed."
    await repos.sources.markVersionFailed(version.id, message)
    await repos.sources.updateIndexJob(job.id, { status: "failed", errorMessage: message }).catch(() => undefined)
    await repos.sources.updateSourceStatus(source.id, "failed", { metadata: { ...metadata, error: message } })
  }
  invalidateProjectSourceCache(userId, projectId, source.id)
  return getProjectSourceDetail(userId, projectId, source.id)
}

export async function getProjectSourceDetail(userId: string, projectId: string, sourceId: string, options: { chunkId?: string; limit?: number } = {}) {
  const repos = createRepositoryBundle(userId)
  const source = await repos.sources.getById(sourceId)
  if (!source || source.projectId !== projectId) throw new NotFoundError("Source not found.")
  if (options.chunkId) {
    const [latestVersion, chunk] = await Promise.all([
      repos.sources.getLatestVersion(sourceId),
      repos.sources.getChunkById(options.chunkId),
    ])
    if (!chunk || chunk.sourceId !== sourceId || chunk.projectId !== projectId) throw new NotFoundError("Source chunk not found.")
    return { source, latestVersion, chunks: [chunk], candidates: [] }
  }
  const [latestVersion, chunks, candidates] = await Promise.all([
    repos.sources.getLatestVersion(sourceId),
    repos.sources.listChunks(sourceId, { limit: Math.min(options.limit ?? 20, 50) }),
    repos.sources.listFactCandidates(sourceId),
  ])
  return { source, latestVersion, chunks, candidates }
}

export async function archiveProjectSource(userId: string, projectId: string, sourceId: string) {
  const repos = createRepositoryBundle(userId)
  const source = await repos.sources.getById(sourceId)
  if (!source || source.projectId !== projectId) throw new NotFoundError("Source not found.")
  const archived = await repos.sources.updateSourceStatus(sourceId, "archived")
  invalidateProjectSourceCache(userId, projectId, sourceId)
  return archived
}

// Permanent, irreversible. Requires the source to already be archived so a
// stray DELETE can never wipe a live source — purge is the deliberate
// "empty trash" step. Drops the encrypted blob then the DB tree (cascade).
export async function hardDeleteProjectSource(userId: string, projectId: string, sourceId: string) {
  const repos = createRepositoryBundle(userId)
  const source = await repos.sources.getById(sourceId)
  if (!source || source.projectId !== projectId) throw new NotFoundError("Source not found.")
  if (source.status !== "archived") {
    throw new BadRequestError("Archive the source before deleting it permanently.")
  }
  if (source.storageObjectKey) {
    await deleteSourceObject({ key: source.storageObjectKey })
  }
  await repos.sources.hardDelete(sourceId)
  invalidateProjectSourceCache(userId, projectId, sourceId)
  return { ok: true }
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

export interface UploadProcessingHandle {
  projectId: string
  sourceId: string
  versionId: string
  objectKey: string
  fileName: string
  mimeType: string
  buffer: Buffer
  sourceMetadata: Record<string, unknown>
}

// Fast path only: validate, enforce quota, persist the source row + file, and
// return the detail in `processing` state immediately. The heavy text
// extraction / chunking / embedding runs out of band via processUploadedSource
// so the request never blocks long enough to time out into a spurious 500.
export async function createSourceFromUpload(userId: string, input: {
  projectId: string
  fileName: string
  mimeType: string
  buffer: Buffer
}): Promise<{ detail: Awaited<ReturnType<typeof getProjectSourceDetail>>; processing: UploadProcessingHandle }> {
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

  // If the blob write fails, the source/version rows already exist. Mark them
  // failed here instead of leaving an orphan stuck in `processing` forever
  // (the heavy pass runs out-of-band and would never get a usable buffer).
  try {
    if (process.env.RELAY_SOURCE_STORAGE_MODE !== "memory") {
      await putEncryptedSourceObject({
        key: objectKey,
        buffer: input.buffer,
        contentType: input.mimeType,
        crypto: { projectId: input.projectId, sourceId: source.id, versionId: version.id },
      })
    }
    await repos.sources.updateSourceObjectKey(source.id, objectKey)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source file storage failed."
    await repos.sources.markVersionFailed(version.id, message)
    await repos.sources.updateSourceStatus(source.id, "failed", { metadata: { ...source.metadata, error: message } })
    invalidateProjectSourceCache(userId, input.projectId, source.id)
    throw new BadRequestError(`Relay could not store this file: ${message}`)
  }

  invalidateProjectSourceCache(userId, input.projectId, source.id)

  return {
    detail: await getProjectSourceDetail(userId, input.projectId, source.id),
    processing: {
      projectId: input.projectId,
      sourceId: source.id,
      versionId: version.id,
      objectKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer: input.buffer,
      sourceMetadata: source.metadata,
    },
  }
}

// Heavy ingestion, run after the response. Any failure is recorded as a failed
// source/version status; it never throws to the caller.
export async function processUploadedSource(userId: string, handle: UploadProcessingHandle) {
  const repos = createRepositoryBundle(userId)
  try {
    const extracted = await extractTextFromSourceBuffer({
      buffer: handle.buffer,
      fileName: handle.fileName,
      mimeType: handle.mimeType,
    })
    if (!extracted.text) {
      throw new BadRequestError("Relay could not extract text from this source.")
    }
    const chunkDrafts = chunkExtractedText(extracted.text, { sourceId: handle.sourceId, versionId: handle.versionId })
    const chunks = await repos.sources.createChunks(chunkDrafts.map((chunk) => ({
      ...chunk,
      projectId: handle.projectId,
    })))
    const candidates = extractFactCandidatesFromChunks(chunks, handle.projectId)
    await repos.sources.createFactCandidates(candidates)
    await repos.sources.markVersionReady(handle.versionId, {
      extractedTextHash: sha256Hex(extracted.text),
      extractedTextBytes: Buffer.byteLength(extracted.text, "utf8"),
      chunkCount: chunks.length,
      tokenEstimate: estimateTokens(extracted.text),
      metadata: extracted.metadata,
    })
    await repos.sources.updateSourceStatus(handle.sourceId, "ready", {
      metadata: { ...handle.sourceMetadata, storageObjectKey: handle.objectKey, extraction: extracted.metadata },
    })
    await embedSourceChunksIfConfigured(userId, chunks)
    await promoteHighConfidenceSourceFacts(userId, handle.sourceId)
    invalidateProjectSourceCache(userId, handle.projectId, handle.sourceId)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source ingestion failed."
    await repos.sources.markVersionFailed(handle.versionId, message)
    await repos.sources.updateSourceStatus(handle.sourceId, "failed", { metadata: { ...handle.sourceMetadata, error: message } })
    invalidateProjectSourceCache(userId, handle.projectId, handle.sourceId)
  }
}

// Retry ingestion for an uploaded file whose first pass never completed
// (orphaned `processing`) or failed. Rebuilds the buffer from the stored
// encrypted blob and re-runs the same heavy pipeline as the upload path.
export async function reprocessUploadedSource(userId: string, projectId: string, sourceId: string) {
  const repos = createRepositoryBundle(userId)
  const source = await repos.sources.getById(sourceId)
  if (!source || source.projectId !== projectId) throw new NotFoundError("Source not found.")
  if (source.kind !== "uploaded_file") {
    throw new BadRequestError("Only uploaded files can be reprocessed this way.")
  }
  if (!source.storageObjectKey) {
    throw new BadRequestError("This source has no stored file to reprocess.")
  }
  const version = await repos.sources.getLatestVersion(sourceId)
  if (!version) throw new BadRequestError("This source has no version to reprocess.")

  const buffer = await getDecryptedSourceObject({
    key: source.storageObjectKey,
    crypto: { projectId, sourceId, versionId: version.id },
  })

  await repos.sources.clearVersionArtifacts(version.id)
  await repos.sources.updateSourceStatus(sourceId, "processing")

  await processUploadedSource(userId, {
    projectId,
    sourceId,
    versionId: version.id,
    objectKey: source.storageObjectKey,
    fileName: source.originalFileName ?? source.displayName,
    mimeType: source.mimeType ?? "application/octet-stream",
    buffer,
    sourceMetadata: source.metadata,
  })

  invalidateProjectSourceCache(userId, projectId, sourceId)
  return getProjectSourceDetail(userId, projectId, sourceId)
}

// Cron-driven recovery for sources orphaned in `processing` (the out-of-band
// `after()` ingest died — deploy/serverless lifecycle). Runs RLS-free. Each
// stale uploaded file gets a bounded number of reprocess attempts; anything
// else (or attempts exhausted) is marked `failed` so it never sticks forever.
export async function sweepStaleProcessingSources(
  options: { olderThanMinutes?: number; limit?: number; maxAttempts?: number } = {},
) {
  const olderThanMinutes = options.olderThanMinutes ?? 15
  const limit = options.limit ?? 5
  const maxAttempts = options.maxAttempts ?? 2
  const repos = createWorkerRepositoryBundle()

  const rows = await repos.provider.query(
    `select id, project_id, created_by, kind, storage_object_key, metadata
     from project_sources
     where status = 'processing'
       and updated_at < now() - make_interval(mins => $1::int)
     order by updated_at asc
     limit $2`,
    [olderThanMinutes, limit],
  )

  const results: Array<{ sourceId: string; action: "reprocessed" | "failed"; error?: string }> = []

  for (const row of rows) {
    const r = row as Record<string, unknown>
    const sourceId = r["id"] as string
    const projectId = r["project_id"] as string
    const userId = r["created_by"] as string
    const kind = r["kind"] as string
    const storageKey = r["storage_object_key"] as string | null
    const metadata = (r["metadata"] as Record<string, unknown> | null) ?? {}
    const attempts = typeof metadata["reprocessAttempts"] === "number" ? metadata["reprocessAttempts"] : 0

    try {
      if (kind === "uploaded_file" && storageKey && attempts < maxAttempts) {
        // Bump the attempt counter (and updated_at) before retrying so a crash
        // mid-reprocess can't put us in a tight retry loop.
        await repos.sources.updateSourceStatus(sourceId, "processing", {
          metadata: { ...metadata, reprocessAttempts: attempts + 1 },
        })
        await reprocessUploadedSource(userId, projectId, sourceId)
        invalidateProjectSourceCache(userId, projectId, sourceId)
        results.push({ sourceId, action: "reprocessed" })
      } else {
        await repos.sources.updateSourceStatus(sourceId, "failed", {
          metadata: { ...metadata, error: "Ingestion did not complete; marked failed by sweep." },
        })
        invalidateProjectSourceCache(userId, projectId, sourceId)
        results.push({ sourceId, action: "failed" })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sweep reprocess failed."
      await repos.sources.updateSourceStatus(sourceId, "failed", {
        metadata: { ...metadata, reprocessAttempts: attempts + 1, error: message },
      })
      invalidateProjectSourceCache(userId, projectId, sourceId)
      results.push({ sourceId, action: "failed", error: message })
    }
  }

  return { swept: rows.length, results }
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

  if (candidates[0]) {
    invalidateProjectCache(userId, candidates[0].projectId)
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
  invalidateProjectSourceCache(userId, projectId, sourceId)
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
    invalidateProjectSourceCache(userId, projectId, sourceId)
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
  invalidateProjectSourceCache(userId, projectId, sourceId)
  return { status: "promoted" as const, memoryItemId: memory.id }
}
