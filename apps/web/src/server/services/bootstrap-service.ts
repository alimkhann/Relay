import { createRepositoryBundle } from "@relay/db"
import type { BootstrapPacketDto, BootstrapRequest, BootstrapPacketRow, MemoryItemRow, ProjectRow, ProjectStateRow, ProjectStateStatusDto, SessionDigestRow, TargetProfileRow } from "@relay/shared"
import { bootstrapRequestSchema, buildEffectiveProjectState, hashContent, mergeGovernedList, normalizeText } from "@relay/shared"

import { GEMINI_MODELS, runGeminiJsonWithFallback } from "./gemini-service"
import { getProjectStateStatus } from "./state-status-service"
import { stripArrowNotation, truncateSentence, escapeMarkdownInline } from "@relay/shared"

interface BootstrapGenerationReady {
  status: "ready"
  packet: BootstrapPacketRow
  reason: null
  resolvedTargetProfileKey: string
  stateStatus: ProjectStateStatusDto
}

interface BootstrapGenerationPending {
  status: "pending"
  packet: null
  reason: string
  resolvedTargetProfileKey: string
  stateStatus: ProjectStateStatusDto
}

export type BootstrapGenerationResult = BootstrapGenerationReady | BootstrapGenerationPending

interface BootstrapModelShape {
  projectOverview: string | null
  currentObjective: string | null
  recentProgress: string | null
  decisions: string[]
  constraints: string[]
  openTasks: string[]
  relevantTools: string[]
  firstAction: string | null
}

interface DigestSnapshotShape {
  projectOverviewDelta: string | null
  currentObjectiveDelta: string | null
  recentProgressDelta: string | null
  newDecisions: string[]
  newConstraints: string[]
  newTasks: string[]
  relevantToolsDelta: string[]
}

function isLowSignalDigestSummary(summary: string) {
  const normalized = normalizeText(summary).toLowerCase()
  if (!normalized) return true
  if (normalized.length < 40) return true
  if (normalized.includes("what's better") || normalized.includes("whats better")) return true
  return normalized.startsWith("chatgpt said:thought for")
}

function sanitizeFirstAction(value: string | null | undefined, state: ProjectStateRow | null) {
  const normalized = value ? truncateSentence(normalizeText(value), 260) : ""

  if (
    !normalized ||
    /^(insert (bootstrap|project brief)|pin selection|save to project|connect relay|open settings|open project)$/i.test(normalized)
  ) {
    return state?.openTasks[0] ?? "Review the project state and continue from the highest-priority open task."
  }

  return normalized
}

function inferRenderer(parsed: BootstrapRequest, state: ProjectStateRow | null) {
  if (parsed.kind === "quick_continuity") {
    return "deterministic" as const
  }

  if (parsed.deep) {
    return "gemini" as const
  }

  return state?.dirty ? "gemini" : "deterministic"
}

function sanitizeList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(String(item))).filter(Boolean).slice(0, 8)
    : []
}

function mergeUnique(base: string[], extra: string[]) {
  const seen = new Set(base.map((item) => item.toLowerCase()))
  const merged = [...base]

  for (const item of extra) {
    const normalized = normalizeText(item)
    if (!normalized) continue

    const key = normalized.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(normalized)
    }
  }

  return merged
}

function readDigestSnapshot(digest: SessionDigestRow | undefined): DigestSnapshotShape {
  const payload = digest?.structuredDigest ?? {}

  return {
    projectOverviewDelta: payload.projectOverviewDelta ? truncateSentence(normalizeText(String(payload.projectOverviewDelta)), 500) : null,
    currentObjectiveDelta: payload.currentObjectiveDelta ? truncateSentence(normalizeText(String(payload.currentObjectiveDelta)), 320) : null,
    recentProgressDelta: payload.recentProgressDelta ? truncateSentence(normalizeText(String(payload.recentProgressDelta)), 500) : null,
    newDecisions: sanitizeList(payload.newDecisions),
    newConstraints: sanitizeList(payload.newConstraints),
    newTasks: sanitizeList(payload.newTasks),
    relevantToolsDelta: sanitizeList(payload.relevantToolsDelta)
  }
}

function isDigestNewerThanState(digest: SessionDigestRow | undefined, state: ProjectStateRow | null) {
  if (!digest) return false
  if (!state?.updatedAt) return true

  return new Date(digest.createdAt).getTime() > new Date(state.updatedAt).getTime()
}

export function shouldReuseLatestBootstrapPacket(input: {
  latestCreatedAt: string | null
  latestDigestCreatedAt: string | null
  stateDirty: boolean
  deep: boolean
  latestInputHash?: string | null
  currentInputHash?: string | null
}) {
  if (input.latestInputHash && input.currentInputHash) {
    return input.latestInputHash === input.currentInputHash
  }

  if (input.deep || input.stateDirty || !input.latestCreatedAt) {
    return false
  }

  if (!input.latestDigestCreatedAt) {
    return true
  }

  return new Date(input.latestCreatedAt).getTime() >= new Date(input.latestDigestCreatedAt).getTime()
}

function sanitizeBootstrapShape(input: BootstrapModelShape, state: ProjectStateRow | null): BootstrapModelShape {
  const decisions = sanitizeList(input.decisions)
  const constraints = sanitizeList(input.constraints)
  const openTasks = sanitizeList(input.openTasks)
  const relevantTools = sanitizeList(input.relevantTools)

  return {
    projectOverview: input.projectOverview ? truncateSentence(normalizeText(input.projectOverview), 500) : state?.projectOverview ?? null,
    currentObjective: input.currentObjective ? truncateSentence(normalizeText(input.currentObjective), 320) : state?.currentObjective ?? null,
    recentProgress: input.recentProgress ? truncateSentence(normalizeText(input.recentProgress), 500) : state?.recentProgress ?? null,
    decisions: decisions.length ? decisions : state?.decisions ?? [],
    constraints: constraints.length ? constraints : state?.constraints ?? [],
    openTasks: openTasks.length ? openTasks : state?.openTasks ?? [],
    relevantTools: relevantTools.length ? relevantTools : state?.relevantTools ?? [],
    firstAction: sanitizeFirstAction(input.firstAction, state)
  }
}

export function computeBootstrapInputHash(input: {
  project: ProjectRow
  state: ProjectStateRow | null
  digests: SessionDigestRow[]
  profile: TargetProfileRow
  kind: BootstrapRequest["kind"]
  memoryItemCount?: number
  memoryLatestUpdatedAt?: string | null
}) {
  return hashContent(
    JSON.stringify({
      kind: input.kind,
      profileKey: input.profile.key,
      projectDescription: input.project.description ?? null,
      state: input.state
        ? {
            projectOverview: input.state.projectOverview,
            currentObjective: input.state.currentObjective,
            recentProgress: input.state.recentProgress,
            decisions: input.state.decisions,
            constraints: input.state.constraints,
            openTasks: input.state.openTasks,
            relevantTools: input.state.relevantTools,
            updatedAt: input.state.updatedAt,
          }
        : null,
      digests: input.digests.slice(0, 6).map((digest) => ({
        id: digest.id,
        createdAt: digest.createdAt,
        summaryShort: digest.summaryShort,
        structuredDigest: digest.structuredDigest,
      })),
      memoryItemCount: input.memoryItemCount ?? 0,
      memoryLatestUpdatedAt: input.memoryLatestUpdatedAt ?? null,
    })
  )
}

export function deterministicBootstrap(state: ProjectStateRow | null, digests: SessionDigestRow[], profile: TargetProfileRow, kind: BootstrapRequest["kind"]): BootstrapModelShape {
  const latestDigest = digests[0]
  const recentSummary = latestDigest?.summaryShort ?? null
  const digestSnapshot = readDigestSnapshot(latestDigest)
  const digestIsNewer = isDigestNewerThanState(latestDigest, state)
  const digestCurrentObjective = digestIsNewer ? digestSnapshot.currentObjectiveDelta : null
  const digestRecentProgress = digestIsNewer ? digestSnapshot.recentProgressDelta ?? recentSummary : recentSummary
  const digestProjectOverview = digestIsNewer ? digestSnapshot.projectOverviewDelta ?? recentSummary : recentSummary
  const decisions = digestIsNewer ? mergeUnique(state?.decisions ?? [], digestSnapshot.newDecisions) : state?.decisions ?? []
  const constraints = digestIsNewer ? mergeUnique(state?.constraints ?? [], digestSnapshot.newConstraints) : state?.constraints ?? []
  const openTasks = digestIsNewer ? mergeUnique(state?.openTasks ?? [], digestSnapshot.newTasks) : state?.openTasks ?? []
  const relevantTools = digestIsNewer
    ? mergeUnique(state?.relevantTools ?? [], digestSnapshot.relevantToolsDelta)
    : state?.relevantTools ?? []

  return {
    projectOverview: (state?.projectOverview ? stripArrowNotation(state.projectOverview) : null) ?? digestProjectOverview ?? "Project context is available and ready to carry forward.",
    currentObjective: digestCurrentObjective ?? (state?.currentObjective ? stripArrowNotation(state.currentObjective) : null) ?? recentSummary ?? "Continue the current project thread.",
    recentProgress:
      kind === "fresh_chat_bootstrap"
        ? (digestIsNewer ? digestRecentProgress : null) ?? state?.recentProgress ?? recentSummary ?? null
        : recentSummary ?? state?.recentProgress ?? null,
    decisions,
    constraints,
    openTasks,
    relevantTools: relevantTools.length ? relevantTools : [profile.name],
    firstAction:
      profile.key === "perplexity_research"
        ? "Start by validating the current objective, then collect the missing facts before answering."
        : "Restate the task briefly, inspect the most relevant project context, and continue from the open tasks."
  }
}

function appendListSection(lines: string[], title: string, items: string[]) {
  if (!items.length) return
  lines.push(`## ${title}`)
  lines.push(...items.map((item) => `- ${escapeMarkdownInline(item)}`))
  lines.push("")
}

function appendTextSection(lines: string[], title: string, value: string | null | undefined) {
  if (!value) return
  lines.push(`## ${title}`)
  lines.push(escapeMarkdownInline(value))
  lines.push("")
}

function formatAge(updatedAt: string): string | null {
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
  if (ageDays >= 14) return "(stale?)"
  if (ageDays >= 7) return `(${ageDays}d ago)`
  return null
}

function filterRelevantNotes(memoryItems: MemoryItemRow[]): MemoryItemRow[] {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  return memoryItems
    .filter((item) => {
      if (!["note", "requirement", "artifact"].includes(item.type)) return false
      // Skip ephemeral IDE session summaries
      if (item.metadata?.source === "mcp" && item.title === "IDE Session Summary") return false
      // Include pinned items always, otherwise only recent
      return item.pinned || new Date(item.updatedAt).getTime() > sevenDaysAgo
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    .slice(0, 5)
}

function renderFreshChatMarkdown(shape: BootstrapModelShape, profile: TargetProfileRow, memoryItems: MemoryItemRow[]) {
  // Collapse near-duplicates before rendering
  const dedupedDecisions = mergeGovernedList([], shape.decisions, "decision")
  const dedupedConstraints = mergeGovernedList([], shape.constraints, "constraint")
  const dedupedTasks = mergeGovernedList([], shape.openTasks, "task")

  const lines = [
    `Use this project brief for ${profile.name}.`,
    "",
    "You are joining this project in a fresh chat. Use the saved project context below so the user does not need to re-explain the work.",
    ""
  ]

  // Section order: Product thesis → Objective → Decisions → Architecture → Changes → Tasks → Notes → Constraints → Instructions
  appendTextSection(lines, "What This Project Is", shape.projectOverview)
  appendTextSection(lines, "Current Objective", shape.currentObjective)
  appendListSection(lines, "Decisions Already Made", dedupedDecisions)
  appendListSection(lines, "Architecture & Tools", shape.relevantTools)
  appendTextSection(lines, "What Changed Recently", shape.recentProgress)

  if (dedupedTasks.length) {
    lines.push("## Open Tasks")
    for (const task of dedupedTasks) {
      lines.push(`- ${escapeMarkdownInline(task)}`)
    }
    lines.push("")
  }

  // Key notes from memory items (risks / context signals)
  const relevantNotes = filterRelevantNotes(memoryItems)
  if (relevantNotes.length > 0) {
    lines.push("## Key Notes")
    for (const note of relevantNotes) {
      const label = note.title ? `**${escapeMarkdownInline(note.title)}**: ` : ""
      const age = formatAge(note.updatedAt)
      const suffix = age ? ` ${age}` : ""
      lines.push(`- ${label}${escapeMarkdownInline(note.content)}${suffix}`)
    }
    lines.push("")
  }

  appendListSection(lines, "Constraints", dedupedConstraints)
  appendTextSection(lines, "How To Continue", shape.firstAction)

  // Budget: keep under ~3500 tokens (rough estimate: text.length / 4)
  const result = lines.join("\n").trim()
  if (result.length / 4 > 3500) {
    // Truncate by removing notes and older decisions to stay within budget
    return renderFreshChatMarkdown(
      { ...shape, decisions: shape.decisions.slice(0, 4) },
      profile,
      relevantNotes.slice(0, 2)
    )
  }

  return result
}

function renderContinuationMarkdown(shape: BootstrapModelShape, profile: TargetProfileRow) {
  const lines = [`Continue this project in ${profile.name}.`, ""]

  if (shape.currentObjective) {
    lines.push(`Current objective: ${shape.currentObjective}`)
  }

  if (shape.recentProgress) {
    lines.push(`Recent progress: ${shape.recentProgress}`)
  }

  if (shape.firstAction) {
    lines.push(`Next step: ${shape.firstAction}`)
  }

  lines.push("")
  appendListSection(lines, "Open Tasks", shape.openTasks.slice(0, 5))
  appendListSection(lines, "Constraints", shape.constraints.slice(0, 5))

  return lines.join("\n").trim()
}

export function renderBootstrapMarkdown(shape: BootstrapModelShape, profile: TargetProfileRow, kind: BootstrapRequest["kind"], memoryItems: MemoryItemRow[] = []) {
  return kind === "quick_continuity" ? renderContinuationMarkdown(shape, profile) : renderFreshChatMarkdown(shape, profile, memoryItems)
}

function describeJobStage(stage: string | null) {
  if (!stage) return null

  const labels: Record<string, string> = {
    queued: "queued",
    count_tokens_primary: "counting tokens on the primary model",
    generate_primary: "generating with the primary model",
    count_tokens_fallback: "counting tokens on the fallback model",
    generate_fallback: "generating with the fallback model",
    merge_state: "merging the digest into project state",
    completed: "completed",
    failed: "failed",
    timed_out: "timed out"
  }

  return labels[stage] ?? stage.replaceAll("_", " ")
}

async function generateGeminiBootstrap(input: {
  state: ProjectStateRow | null
  digests: SessionDigestRow[]
  profile: TargetProfileRow
  kind: BootstrapRequest["kind"]
}) {
  const result = await runGeminiJsonWithFallback<BootstrapModelShape>({
    primaryModel: GEMINI_MODELS.bootstrap.primary,
    fallbackModel: GEMINI_MODELS.bootstrap.fallback,
    maxInputTokens: GEMINI_MODELS.bootstrap.maxInputTokens,
    maxOutputTokens: GEMINI_MODELS.bootstrap.maxOutputTokens,
    systemInstruction:
      input.kind === "quick_continuity"
        ? "You write short continuation briefs for ongoing AI chats. Return only JSON. Prefer immediate task continuity, recent progress, constraints, and the next action."
        : "You write explanatory project briefs for fresh AI chats. Return only JSON. Prefer durable project state, clear tasks, and concise sections over transcript detail.",
    prompt: [
      "Return a JSON object with these keys exactly:",
      "projectOverview, currentObjective, recentProgress, decisions, constraints, openTasks, relevantTools, firstAction.",
      "Do not include markdown in the JSON values.",
      input.kind === "quick_continuity"
        ? "Make this continuation brief short, immediate, and task-focused."
        : "Make this fresh-chat brief explanatory enough that a new chat can continue without a re-brief.",
      `Target profile: ${input.profile.name}`,
      ...(input.state?.projectOverview ? [`Project overview: ${input.state.projectOverview}`] : []),
      ...(input.state?.currentObjective ? [`Current objective: ${input.state.currentObjective}`] : []),
      ...(input.state?.recentProgress ? [`Recent progress: ${input.state.recentProgress}`] : []),
      ...((input.state?.decisions ?? []).length ? [`Decisions: ${input.state!.decisions.join(" | ")}`] : []),
      ...((input.state?.constraints ?? []).length ? [`Constraints: ${input.state!.constraints.join(" | ")}`] : []),
      ...((input.state?.openTasks ?? []).length ? [`Open tasks: ${input.state!.openTasks.join(" | ")}`] : []),
      ...((input.state?.relevantTools ?? []).length ? [`Relevant tools: ${input.state!.relevantTools.join(" | ")}`] : []),
      ...(() => {
        const summaries = input.digests
          .filter((digest) => !isLowSignalDigestSummary(digest.summaryShort))
          .slice(0, 6)
          .map((digest, index) => `${index + 1}. ${digest.summaryShort}`)
          .join("\n")
        return summaries ? ["Recent digest summaries:", summaries] : []
      })()
    ].join("\n\n")
  })

  return {
    shape: sanitizeBootstrapShape(result.data, input.state),
    actualModel: result.actualModel,
    primaryModel: result.primaryModel,
    fallbackUsed: result.fallbackUsed,
    tokenUsage: result.tokenUsage
  }
}

function getPendingReason(stateStatus: ProjectStateStatusDto) {
  const stageLabel = describeJobStage(stateStatus.activeJobStage)

  if (stateStatus.digestStatus === "failed") {
    if (stateStatus.digestErrorMessage && stageLabel) {
      return `Digest failed while ${stageLabel}. ${stateStatus.digestErrorMessage}`
    }

    return stateStatus.digestErrorMessage ?? "Digest failed. Refresh Relay or capture the chat again."
  }

  if (stateStatus.digestStatus === "timed_out") {
    return stageLabel
      ? `Digest timed out while ${stageLabel}. Relay is ready to retry it.`
      : "Relay is retrying the digest for this chat. Try again in a moment."
  }

  if (stateStatus.digestStatus === "running" || stateStatus.digestStatus === "pending") {
    return stageLabel
      ? `Digest pending. Relay is ${stageLabel}.`
      : "Digest pending. Relay is still turning this chat into project state."
  }

  if (stateStatus.rawCapturePresent) {
    return "Digest pending. Relay is still turning this chat into project state."
  }

  return "Capture a meaningful chat first so Relay can build project state."
}

export function shouldDeferBootstrapGeneration(state: ProjectStateRow | null, digests: SessionDigestRow[]) {
  return !state && digests.length === 0
}

export async function generateBootstrapForProject(userId: string, projectId: string, input: unknown): Promise<BootstrapGenerationResult> {
  const repositories = createRepositoryBundle(userId)
  const parsed = bootstrapRequestSchema.parse(input)
  const [project, profile, rawState, digests, memoryItems, stateOverrides] = await Promise.all([
    repositories.projects.getById(projectId),
    repositories.targetProfiles.getByKey(parsed.targetProfileKey),
    repositories.projectState.getByProject(projectId),
    repositories.sessionDigests.listByProject(projectId),
    repositories.memory.listByProject(projectId),
    repositories.projectStateOverrides.getByProject(projectId)
  ])

  if (!project) {
    throw new Error("Project not found.")
  }

  if (!profile) {
    throw new Error("Target profile not found.")
  }

  // Archive stale unpinned tasks (lazy cleanup at brief generation time)
  const STALE_TASK_DAYS = 14
  const staleThreshold = Date.now() - STALE_TASK_DAYS * 24 * 60 * 60 * 1000
  const staleTasks = memoryItems.filter(
    (item) =>
      item.type === "task" &&
      !item.pinned &&
      new Date(item.updatedAt).getTime() < staleThreshold
  )
  if (staleTasks.length > 0) {
    await Promise.all(
      staleTasks.map((item) =>
        repositories.memory.update(item.id, { isArchived: true })
      )
    )
  }

  // Filter out archived stale tasks from the working set
  const activeMemoryItems = staleTasks.length > 0
    ? memoryItems.filter((item) => !staleTasks.some((stale) => stale.id === item.id))
    : memoryItems

  // Build effective state by merging derived state + overrides + memory items
  const derivedStateDto = rawState
    ? {
        projectOverview: rawState.projectOverview,
        currentObjective: rawState.currentObjective,
        stackDomain: rawState.stackDomain,
        recentProgress: rawState.recentProgress,
        decisions: rawState.decisions,
        constraints: rawState.constraints,
        openTasks: rawState.openTasks,
        relevantTools: rawState.relevantTools,
        lastBootstrapAt: rawState.lastBootstrapAt,
        dirty: rawState.dirty,
        updatedAt: rawState.updatedAt
      }
    : null
  const overrideDto = stateOverrides
    ? {
        projectOverviewOverride: stateOverrides.projectOverviewOverride,
        currentObjectiveOverride: stateOverrides.currentObjectiveOverride,
        recentProgressOverride: stateOverrides.recentProgressOverride,
        hiddenDecisions: stateOverrides.hiddenDecisions,
        hiddenConstraints: stateOverrides.hiddenConstraints,
        hiddenOpenTasks: stateOverrides.hiddenOpenTasks,
        updatedAt: stateOverrides.updatedAt
      }
    : null
  const memoryDtos = activeMemoryItems.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    pinned: item.pinned,
    updatedAt: item.updatedAt,
    sourceSurface: item.sourceSurface,
    sourceUrl: item.sourceUrl,
    capturedAt: item.capturedAt,
  }))
  const effectiveStateDto = buildEffectiveProjectState(derivedStateDto, overrideDto, memoryDtos)

  // Map effective state back to a ProjectStateRow-shaped object for bootstrap functions
  const state: ProjectStateRow | null = effectiveStateDto
    ? {
        projectId,
        projectOverview: effectiveStateDto.projectOverview,
        currentObjective: effectiveStateDto.currentObjective,
        stackDomain: effectiveStateDto.stackDomain,
        recentProgress: effectiveStateDto.recentProgress,
        decisions: effectiveStateDto.decisions,
        constraints: effectiveStateDto.constraints,
        openTasks: effectiveStateDto.openTasks,
        relevantTools: effectiveStateDto.relevantTools,
        lastBootstrapAt: effectiveStateDto.lastBootstrapAt,
        dirty: effectiveStateDto.dirty,
        createdAt: rawState?.createdAt ?? new Date(0).toISOString(),
        updatedAt: effectiveStateDto.updatedAt
      }
    : null

  const stateStatus = await getProjectStateStatus(repositories, projectId)
  if (shouldDeferBootstrapGeneration(state, digests)) {
    return {
      status: "pending",
      packet: null,
      reason: getPendingReason(stateStatus),
      resolvedTargetProfileKey: parsed.targetProfileKey,
      stateStatus
    }
  }

  const briefInputHash = computeBootstrapInputHash({
    project,
    state,
    digests,
    profile,
    kind: parsed.kind,
    memoryItemCount: activeMemoryItems.length,
    memoryLatestUpdatedAt: activeMemoryItems[0]?.updatedAt ?? null,
  })
  const latest = await repositories.bootstrapPackets.getLatest(projectId, profile.id, parsed.kind)
  if (
    latest &&
    shouldReuseLatestBootstrapPacket({
      latestCreatedAt: latest.createdAt,
      latestDigestCreatedAt: digests[0]?.createdAt ?? null,
      stateDirty: Boolean(state?.dirty),
      deep: Boolean(parsed.deep),
      latestInputHash:
        typeof latest.generationMetadata?.input_hash === "string"
          ? String(latest.generationMetadata.input_hash)
          : null,
      currentInputHash: briefInputHash,
    })
  ) {
    return {
      status: "ready",
      packet: latest,
      reason: null,
      resolvedTargetProfileKey: parsed.targetProfileKey,
      stateStatus
    }
  }

  const preferredRenderer = inferRenderer(parsed, state)
  const deterministic = deterministicBootstrap(state, digests, profile, parsed.kind)

  let shape = deterministic
  let renderer: BootstrapPacketRow["renderer"] = "deterministic"
  let actualModel = "deterministic"
  let primaryModel = preferredRenderer === "gemini" ? GEMINI_MODELS.bootstrap.primary : "deterministic"
  let fallbackUsed = false
  let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

  if (preferredRenderer === "gemini") {
    try {
      const generated = await generateGeminiBootstrap({ state, digests, profile, kind: parsed.kind })
      shape = generated.shape
      renderer = "gemini"
      actualModel = generated.actualModel
      primaryModel = generated.primaryModel
      fallbackUsed = generated.fallbackUsed
      tokenUsage = generated.tokenUsage
    } catch {
      shape = deterministic
    }
  }

  const packet = await repositories.bootstrapPackets.create({
    projectId,
    targetProfileId: profile.id,
    kind: parsed.kind,
    content: renderBootstrapMarkdown(shape, profile, parsed.kind, activeMemoryItems),
    structuredSnapshot: { ...shape },
    renderer,
    generationMetadata: {
      input_hash: briefInputHash,
      primary_model: primaryModel,
      actual_model: actualModel,
      fallback_used: fallbackUsed,
      token_usage: tokenUsage
    },
    createdBy: userId
  })

  if (rawState) {
    await repositories.projectState.markBootstrapped(projectId)
  }

  const aiJob = await repositories.aiJobs.create({
    projectId,
    sessionId: null,
    createdBy: userId,
    jobKind: parsed.kind,
    inputPayload: {
      targetProfileKey: parsed.targetProfileKey
    },
    primaryModel: primaryModel === "deterministic" ? null : primaryModel
  })

  await repositories.aiJobs.markCompleted(aiJob.id, {
    actualModel,
    fallbackUsed,
    tokenUsage,
    outputPayload: {
      packetId: packet.id,
      renderer
    }
  })

  return {
    status: "ready",
    packet,
    reason: null,
    resolvedTargetProfileKey: parsed.targetProfileKey,
    stateStatus: {
      ...stateStatus,
      digestStatus: "completed",
      projectStateReady: Boolean(rawState ?? digests.length > 0),
      lastDigestAt: packet.createdAt
    }
  }
}

export async function getLatestBootstrapForProject(userId: string, projectId: string, targetProfileKey: string, kind: BootstrapPacketRow["kind"]) {
  const repositories = createRepositoryBundle(userId)
  const profile = await repositories.targetProfiles.getByKey(targetProfileKey)
  if (!profile) {
    throw new Error("Target profile not found.")
  }

  return repositories.bootstrapPackets.getLatest(projectId, profile.id, kind)
}

export async function listBootstrapPacketsForProject(userId: string, projectId: string): Promise<BootstrapPacketDto[]> {
  const repositories = createRepositoryBundle(userId)
  const [packets, profiles] = await Promise.all([repositories.bootstrapPackets.listByProject(projectId), repositories.targetProfiles.listAll()])
  const profileById = new Map(profiles.map((profile) => [profile.id, profile.key]))

  return packets.map((packet) => ({
    id: packet.id,
    kind: packet.kind,
    content: packet.content,
    targetProfileKey: profileById.get(packet.targetProfileId) ?? "unknown",
    renderer: packet.renderer,
    createdAt: packet.createdAt
  }))
}
