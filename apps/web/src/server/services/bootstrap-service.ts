import { createRepositoryBundle } from "@relay/db"
import type { BootstrapPacketDto, BootstrapRequest, BootstrapPacketRow, ProjectRow, ProjectStateRow, ProjectStateStatusDto, SessionDigestRow, TargetProfileRow } from "@relay/shared"
import { bootstrapRequestSchema, hashContent, normalizeText } from "@relay/shared"

import { GEMINI_MODELS, runGeminiJsonWithFallback } from "./gemini-service"
import { getProjectStateStatus } from "./state-status-service"

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
  const normalized = value ? normalizeText(value).slice(0, 260) : ""

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
    projectOverviewDelta: payload.projectOverviewDelta ? normalizeText(String(payload.projectOverviewDelta)).slice(0, 500) : null,
    currentObjectiveDelta: payload.currentObjectiveDelta ? normalizeText(String(payload.currentObjectiveDelta)).slice(0, 320) : null,
    recentProgressDelta: payload.recentProgressDelta ? normalizeText(String(payload.recentProgressDelta)).slice(0, 500) : null,
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
    projectOverview: input.projectOverview ? normalizeText(input.projectOverview).slice(0, 500) : state?.projectOverview ?? null,
    currentObjective: input.currentObjective ? normalizeText(input.currentObjective).slice(0, 320) : state?.currentObjective ?? null,
    recentProgress: input.recentProgress ? normalizeText(input.recentProgress).slice(0, 500) : state?.recentProgress ?? null,
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
    projectOverview: state?.projectOverview ?? digestProjectOverview ?? "Project context is available and ready to carry forward.",
    currentObjective: digestCurrentObjective ?? state?.currentObjective ?? recentSummary ?? "Continue the current project thread.",
    recentProgress:
      kind === "fresh_chat_bootstrap"
        ? digestRecentProgress ?? state?.recentProgress ?? null
        : digestRecentProgress ?? state?.recentProgress ?? null,
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
  lines.push(...items.map((item) => `- ${item}`))
  lines.push("")
}

function appendTextSection(lines: string[], title: string, value: string | null | undefined) {
  if (!value) return
  lines.push(`## ${title}`)
  lines.push(value)
  lines.push("")
}

function renderFreshChatMarkdown(shape: BootstrapModelShape, profile: TargetProfileRow) {
  const lines = [
    `Use this project brief for ${profile.name}.`,
    "",
    "You are joining this project in a fresh chat. Use the saved project context below so the user does not need to re-explain the work.",
    ""
  ]

  appendTextSection(lines, "What This Project Is", shape.projectOverview)
  appendTextSection(lines, "Current Objective", shape.currentObjective)
  appendTextSection(lines, "What Changed Recently", shape.recentProgress)
  appendListSection(lines, "Decisions Already Made", shape.decisions)
  appendListSection(lines, "Constraints To Respect", shape.constraints)
  appendListSection(lines, "Open Tasks", shape.openTasks)
  appendListSection(lines, "Useful Context", shape.relevantTools)
  appendTextSection(lines, "How This Chat Should Continue", shape.firstAction)

  return lines.join("\n").trim()
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
  appendListSection(lines, "Constraints", shape.constraints.slice(0, 5))
  appendListSection(lines, "Open Tasks", shape.openTasks.slice(0, 5))

  return lines.join("\n").trim()
}

export function renderBootstrapMarkdown(shape: BootstrapModelShape, profile: TargetProfileRow, kind: BootstrapRequest["kind"]) {
  return kind === "quick_continuity" ? renderContinuationMarkdown(shape, profile) : renderFreshChatMarkdown(shape, profile)
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
      `Project overview: ${input.state?.projectOverview ?? "None."}`,
      `Current objective: ${input.state?.currentObjective ?? "None."}`,
      `Recent progress: ${input.state?.recentProgress ?? "None."}`,
      `Decisions: ${(input.state?.decisions ?? []).join(" | ") || "None."}`,
      `Constraints: ${(input.state?.constraints ?? []).join(" | ") || "None."}`,
      `Open tasks: ${(input.state?.openTasks ?? []).join(" | ") || "None."}`,
      `Relevant tools: ${(input.state?.relevantTools ?? []).join(" | ") || "None."}`,
      "Recent digest summaries:",
      input.digests
        .filter((digest) => !isLowSignalDigestSummary(digest.summaryShort))
        .slice(0, 6)
        .map((digest, index) => `${index + 1}. ${digest.summaryShort}`)
        .join("\n") || "None."
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
  const [project, profile, state, digests] = await Promise.all([
    repositories.projects.getById(projectId),
    repositories.targetProfiles.getByKey(parsed.targetProfileKey),
    repositories.projectState.getByProject(projectId),
    repositories.sessionDigests.listByProject(projectId)
  ])

  if (!project) {
    throw new Error("Project not found.")
  }

  if (!profile) {
    throw new Error("Target profile not found.")
  }

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
    content: renderBootstrapMarkdown(shape, profile, parsed.kind),
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

  const currentState = state
  if (currentState) {
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
      projectStateReady: Boolean(state ?? digests.length > 0),
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
