import { createRepositoryBundle } from "@relay/db"
import type {
  BootstrapPacketRow,
  CanonEntryRow,
  MemoryItemRow,
  MemoryRelationRow,
  ProjectStateRow,
  ProjectSummarySnapshotRow,
  SessionDigestRow,
  SourceSessionRow,
  WorkSessionRow,
} from "@relay/shared"

function normalizeMatch(value: string) {
  return value.trim().toLowerCase()
}

function includesMatch(haystack: string | null | undefined, needle: string) {
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle)
}

function summarizeMemory(item: MemoryItemRow, relations: MemoryRelationRow[] = []) {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>
  const tags = Array.isArray(item.tags) ? item.tags : []
  const derivedFrom = Array.isArray(item.derivedFrom) ? item.derivedFrom : []
  const relationList = Array.isArray(relations) ? relations : []
  return {
    id: item.id,
    type: item.type,
    title: item.title ?? null,
    content: item.content ?? "",
    pinned: Boolean(item.pinned),
    isArchived: Boolean(item.isArchived),
    tags,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    provenance: {
      sourceSurface: item.sourceSurface ?? null,
      sourceConversationId: item.sourceConversationId ?? null,
      sourceUrl: item.sourceUrl ?? null,
      capturedAt: item.capturedAt ?? null,
      derivedFrom,
      digestId: typeof metadata.digestId === "string" ? metadata.digestId : null,
      source: typeof metadata.source === "string" ? metadata.source : null,
      parentBullet: typeof metadata.parentBullet === "string" ? metadata.parentBullet : null,
    },
    status: {
      conflictStatus: typeof metadata.conflictStatus === "string" ? metadata.conflictStatus : null,
      validationState: typeof metadata.validationState === "string" ? metadata.validationState : null,
      archivedReason: typeof metadata.archivedReason === "string" ? metadata.archivedReason : null,
      compactionState: typeof metadata.compactionState === "string" ? metadata.compactionState : null,
      lastReaffirmedAt: item.lastReaffirmedAt ?? null,
      forgetAfter: item.forgetAfter ?? null,
    },
    relations: relationList.map((relation) => ({
      id: relation.id,
      relationType: relation.relationType,
      confidence: relation.confidence,
      direction: relation.sourceId === item.id ? "outgoing" : "incoming",
      otherMemoryId: relation.sourceId === item.id ? relation.targetId : relation.sourceId,
    })),
  }
}

function summarizeBrief(packet: BootstrapPacketRow, profileById: Map<string, string>) {
  const metadata = packet.generationMetadata ?? {}
  return {
    id: packet.id,
    kind: packet.kind,
    targetProfileKey: profileById.get(packet.targetProfileId) ?? "unknown",
    renderer: packet.renderer,
    createdAt: packet.createdAt,
    edited: Boolean(metadata.edited_at),
    syncSurface: typeof metadata.syncSurface === "string" ? metadata.syncSurface : null,
    packetMode: typeof metadata.packetMode === "string" ? metadata.packetMode : null,
    contentPreview: packet.content.slice(0, 240),
  }
}

function summarizeDigest(digest: SessionDigestRow) {
  return {
    id: digest.id,
    sourceSessionId: digest.sourceSessionId,
    summaryShort: digest.summaryShort,
    confidence: digest.confidence,
    importanceScore: digest.importanceScore,
    mergedAt: digest.mergedAt,
    createdAt: digest.createdAt,
    structuredDigest: digest.structuredDigest,
  }
}

function summarizeSession(session: SourceSessionRow) {
  return {
    id: session.id,
    platform: session.platform,
    title: session.title,
    url: session.url,
    sourceConversationId: session.sourceConversationId,
    capturedAt: session.capturedAt,
    isArchived: session.isArchived,
    metadata: session.metadata,
  }
}

function summarizeWorkSession(session: WorkSessionRow) {
  return {
    id: session.id,
    surface: session.surface,
    threadId: session.threadId,
    agentName: session.agentName,
    clientName: session.clientName,
    associationMethod: session.associationMethod,
    associationConfidence: session.associationConfidence,
    latestSummary: session.latestSummary,
    latestStructuredState: session.latestStructuredState,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    updatedAt: session.updatedAt,
  }
}

function matchProjectState(state: ProjectStateRow | null, needle: string, stateField?: string) {
  if (!state) return []
  const fields = [
    { field: "projectOverview", value: state.projectOverview },
    { field: "currentObjective", value: state.currentObjective },
    { field: "recentProgress", value: state.recentProgress },
    ...state.decisions.map((value, index) => ({ field: `decisions[${index}]`, value })),
    ...state.constraints.map((value, index) => ({ field: `constraints[${index}]`, value })),
    ...state.openTasks.map((value, index) => ({ field: `openTasks[${index}]`, value })),
    ...state.relevantTools.map((value, index) => ({ field: `relevantTools[${index}]`, value })),
  ]

  return fields.filter((entry) => {
    if (stateField && entry.field !== stateField && !entry.field.startsWith(`${stateField}[`)) return false
    return stateField ? true : includesMatch(entry.value, needle)
  })
}

function findMatchingMemory(items: MemoryItemRow[], needle: string) {
  return items.filter((item) =>
    includesMatch(item.content, needle)
    || includesMatch(item.title, needle)
    || item.tags.some((tag) => includesMatch(tag, needle))
  )
}

function findMatchingDigests(digests: SessionDigestRow[], needle: string) {
  return digests.filter((digest) =>
    includesMatch(digest.summaryShort, needle)
    || includesMatch(JSON.stringify(digest.structuredDigest), needle)
  )
}

function findMatchingCanon(entries: CanonEntryRow[], needle: string) {
  return entries.filter((entry) =>
    includesMatch(entry.title, needle) || includesMatch(entry.content, needle)
  )
}

function findMatchingSnapshots(entries: ProjectSummarySnapshotRow[], needle: string) {
  return entries.filter((entry) => includesMatch(entry.content, needle))
}

function findMatchingBriefs(entries: BootstrapPacketRow[], needle: string) {
  return entries.filter((entry) => includesMatch(entry.content, needle))
}

function findMatchingSessions(entries: SourceSessionRow[], needle: string) {
  return entries.filter((entry) =>
    includesMatch(entry.title, needle)
    || includesMatch(entry.url, needle)
    || includesMatch(entry.sourceConversationId, needle)
  )
}

function describeActivityEntry(input: {
  kind: string
  timestamp: string
  title: string
  detail: string
  sourceId: string | null
  sourceType: string
  sourceSurface?: string | null
  payload?: Record<string, unknown>
}) {
  return {
    kind: input.kind,
    timestamp: input.timestamp,
    title: input.title,
    detail: input.detail,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    sourceSurface: input.sourceSurface ?? null,
    payload: input.payload ?? {},
  }
}

export async function listMemoryForExplainability(
  userId: string,
  projectId: string,
  input: {
    archived?: boolean
    pinned?: boolean
    tag?: string
    types?: MemoryItemRow["type"][]
    limit?: number
    sort?: "updated_desc" | "created_desc"
  } = {},
) {
  const repositories = createRepositoryBundle(userId)
  const items = await repositories.memory.listByProject(projectId, {
    includeArchived: input.archived ?? false,
    pinned: input.pinned,
    tag: input.tag,
    types: input.types,
    limit: input.limit,
    sort: input.sort,
  })
  const summaries: ReturnType<typeof summarizeMemory>[] = []
  for (const item of items) {
    try {
      summaries.push(summarizeMemory(item))
    } catch (error) {
      console.error(
        `[continuity-explainability] summarizeMemory failed for item ${item?.id ?? "<unknown>"} in project ${projectId}:`,
        error instanceof Error ? error.stack ?? error.message : error,
      )
    }
  }
  return summaries
}

export async function getMemoryForExplainability(
  userId: string,
  memoryId: string,
  projectId?: string,
) {
  const repositories = createRepositoryBundle(userId)
  const item = await repositories.memory.getById(memoryId)
  if (!item || (projectId && item.projectId !== projectId)) {
    return null
  }

  const relations = await repositories.memory.getRelationsForItem(item.id)
  return summarizeMemory(item, relations)
}

export async function listSessionsForExplainability(
  userId: string,
  projectId: string,
  input: {
    includeArchived?: boolean
    limit?: number
    surfaces?: string[]
  } = {},
) {
  const repositories = createRepositoryBundle(userId)
  const [sourceSessions, groupedSessions, workSessions] = await Promise.all([
    repositories.sessions.listByProject(projectId, {
      includeArchived: input.includeArchived ?? false,
      limit: input.limit ?? 20,
    }),
    repositories.sessions.getGroupedSessions(projectId, {
      includeArchived: input.includeArchived ?? false,
      limit: input.limit ?? 20,
    }),
    repositories.workSessions.listByProject({
      projectId,
      limit: input.limit ?? 20,
      statuses: input.includeArchived ? ["active", "closed", "stale"] : ["active", "stale"],
    }),
  ])

  const filteredSource = input.surfaces?.length
    ? sourceSessions.filter((session) => input.surfaces?.includes(session.platform))
    : sourceSessions
  const filteredWork = input.surfaces?.length
    ? workSessions.filter((session) => input.surfaces?.includes(session.surface))
    : workSessions

  return {
    groupedSessions,
    sourceSessions: filteredSource.map((session) => summarizeSession(session)),
    workSessions: filteredWork.map((session) => summarizeWorkSession(session)),
  }
}

export async function listBriefsForExplainability(
  userId: string,
  projectId: string,
  input: { limit?: number } = {},
) {
  const repositories = createRepositoryBundle(userId)
  const [packets, profiles] = await Promise.all([
    repositories.bootstrapPackets.listByProject(projectId, input.limit ?? 20),
    repositories.targetProfiles.listAll(),
  ])
  const profileById = new Map(profiles.map((profile) => [profile.id, profile.key]))
  return packets.map((packet) => summarizeBrief(packet, profileById))
}

export async function listRecentContinuityActivity(
  userId: string,
  projectId: string,
  input: { limit?: number } = {},
) {
  const repositories = createRepositoryBundle(userId)
  const limit = input.limit ?? 20

  const [captureEvents, memoryEvents, digests, workSessionEvents, briefs] = await Promise.all([
    repositories.events.listRecentByProject({ projectId, limit }),
    repositories.memoryEvents.listRecentForProject({ projectId, limit }),
    repositories.sessionDigests.listByProject(projectId, limit),
    repositories.workSessionEvents.listRecentByProject({ projectId, limit }),
    repositories.bootstrapPackets.listByProject(projectId, limit),
  ])

  const entries = [
    ...captureEvents.map((event) =>
      describeActivityEntry({
        kind: "capture_saved",
        timestamp: event.createdAt,
        title: "Capture saved",
        detail: typeof event.payload?.platform === "string"
          ? `Captured from ${event.payload.platform}`
          : "Captured source session",
        sourceId: event.sessionId,
        sourceType: "capture_event",
        payload: event.payload,
      })),
    ...memoryEvents.map((event) =>
      describeActivityEntry({
        kind: `memory_${event.eventType}`,
        timestamp: event.createdAt,
        title: `Memory ${event.eventType}`,
        detail: event.memoryItemId ? `Memory item ${event.memoryItemId.slice(0, 8)}` : "Memory mutation",
        sourceId: event.memoryItemId,
        sourceType: "memory_event",
        sourceSurface: event.sourceSurface,
        payload: event.payload,
      })),
    ...digests.map((digest) =>
      describeActivityEntry({
        kind: "digest_created",
        timestamp: digest.createdAt,
        title: digest.summaryShort,
        detail: `${Math.round(digest.confidence * 100)}% confidence${digest.mergedAt ? " · merged" : ""}`,
        sourceId: digest.id,
        sourceType: "session_digest",
        payload: digest.structuredDigest,
      })),
    ...workSessionEvents.map((event) =>
      describeActivityEntry({
        kind: event.eventType,
        timestamp: event.createdAt,
        title: event.eventType.replaceAll("_", " "),
        detail: event.sourceSurface ? `Surface ${event.sourceSurface}` : "Work-session event",
        sourceId: event.workSessionId,
        sourceType: "work_session_event",
        sourceSurface: event.sourceSurface,
        payload: event.payload,
      })),
    ...briefs.map((brief) =>
      describeActivityEntry({
        kind: "brief_generated",
        timestamp: brief.createdAt,
        title: "Brief generated",
        detail: `${brief.kind} · ${brief.renderer}`,
        sourceId: brief.id,
        sourceType: "bootstrap_packet",
        payload: brief.generationMetadata,
      })),
  ]

  return entries
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, limit)
}

export async function traceContextSources(
  userId: string,
  projectId: string,
  input: {
    query?: string
    stateField?: string
    limit?: number
  },
) {
  const repositories = createRepositoryBundle(userId)
  const [state, memoryItems, digests, canonEntries, snapshots, sessions, briefs, profiles] = await Promise.all([
    repositories.projectState.getByProject(projectId),
    repositories.memory.listByProject(projectId, { includeArchived: true }),
    repositories.sessionDigests.listByProject(projectId, input.limit ?? 12, { includeArchived: true }),
    repositories.canonEntries.listByProject(projectId, {
      statuses: ["active", "tentative", "disputed", "superseded"],
      limit: Math.max(24, input.limit ?? 12),
    }),
    repositories.projectSummarySnapshots.listLatestByProject(projectId, { limit: Math.max(24, input.limit ?? 12) }),
    repositories.sessions.listByProject(projectId, { includeArchived: true, limit: Math.max(24, input.limit ?? 12) }),
    repositories.bootstrapPackets.listByProject(projectId, Math.max(24, input.limit ?? 12)),
    repositories.targetProfiles.listAll(),
  ])

  const limit = input.limit ?? 8
  const needle = input.query ? normalizeMatch(input.query) : ""
  const profileById = new Map(profiles.map((profile) => [profile.id, profile.key]))

  const stateMatches = matchProjectState(state, needle, input.stateField)
  const matchingMemory = input.stateField ? [] : findMatchingMemory(memoryItems, needle)
  const matchingDigests = input.stateField ? [] : findMatchingDigests(digests, needle)
  const matchingCanon = input.stateField ? [] : findMatchingCanon(canonEntries, needle)
  const matchingSnapshots = input.stateField ? [] : findMatchingSnapshots(snapshots, needle)
  const matchingSessions = input.stateField ? [] : findMatchingSessions(sessions, needle)
  const matchingBriefs = input.stateField ? [] : findMatchingBriefs(briefs, needle)

  const relatedDigestIds = new Set<string>()
  const relatedSessionIds = new Set<string>()

  for (const item of matchingMemory) {
    const digestId = item.metadata?.digestId
    if (typeof digestId === "string") relatedDigestIds.add(digestId)
    if (item.sourceConversationId) relatedSessionIds.add(item.sourceConversationId)
  }
  for (const digest of matchingDigests) {
    relatedDigestIds.add(digest.id)
    relatedSessionIds.add(digest.sourceSessionId)
  }

  return {
    query: input.query ?? null,
    stateField: input.stateField ?? null,
    stateMatches: stateMatches.slice(0, limit),
    memory: matchingMemory.slice(0, limit).map((item) => summarizeMemory(item)),
    digests: matchingDigests.slice(0, limit).map((digest) => summarizeDigest(digest)),
    canon: matchingCanon.slice(0, limit).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      status: entry.status,
      confidence: entry.confidence,
      content: entry.content,
      title: entry.title,
      supersedesEntryId: entry.supersedesEntryId,
      metadata: entry.metadata,
      updatedAt: entry.updatedAt,
    })),
    summarySnapshots: matchingSnapshots.slice(0, limit).map((snapshot) => ({
      id: snapshot.id,
      kind: snapshot.kind,
      content: snapshot.content,
      derivedFrom: snapshot.derivedFrom,
      generationMetadata: snapshot.generationMetadata,
      createdAt: snapshot.createdAt,
    })),
    sessions: matchingSessions.slice(0, limit).map((session) => summarizeSession(session)),
    briefs: matchingBriefs.slice(0, limit).map((brief) => summarizeBrief(brief, profileById)),
    related: {
      digestIds: Array.from(relatedDigestIds).slice(0, limit),
      sessionIds: Array.from(relatedSessionIds).slice(0, limit),
    },
  }
}
