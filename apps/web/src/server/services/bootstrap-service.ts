import { createRepositoryBundle } from "@relay/db"
import type { BootstrapPacketDto, BootstrapRequest, BootstrapPacketRow, ProjectStateRow, ProjectStateStatusDto, SessionDigestRow, TargetProfileRow } from "@relay/shared"
import { bootstrapRequestSchema, normalizeText } from "@relay/shared"

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
    /^(insert bootstrap|pin selection|connect relay|open settings|open project)$/i.test(normalized)
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

function deterministicBootstrap(state: ProjectStateRow | null, digests: SessionDigestRow[], profile: TargetProfileRow): BootstrapModelShape {
  const latestDigest = digests[0]
  return {
    projectOverview: state?.projectOverview ?? latestDigest?.summaryShort ?? "Project context is available but not yet summarized.",
    currentObjective: state?.currentObjective ?? latestDigest?.summaryShort ?? "Continue the current project thread.",
    recentProgress: state?.recentProgress ?? latestDigest?.summaryShort ?? null,
    decisions: state?.decisions ?? [],
    constraints: state?.constraints ?? [],
    openTasks: state?.openTasks ?? [],
    relevantTools: state?.relevantTools.length ? state.relevantTools : [profile.name],
    firstAction:
      profile.key === "perplexity_research"
        ? "Start by validating the current objective, then collect the missing facts before answering."
        : "Restate the task briefly, inspect the most relevant project context, and continue from the open tasks."
  }
}

function renderBootstrapMarkdown(shape: BootstrapModelShape, profile: TargetProfileRow) {
  return [
    `Target: ${profile.name}`,
    "",
    "## Project Overview",
    shape.projectOverview ?? "Not set.",
    "",
    "## Current Objective",
    shape.currentObjective ?? "Not set.",
    "",
    "## Recent Progress",
    shape.recentProgress ?? "No recent progress captured yet.",
    "",
    "## Decisions",
    ...(shape.decisions.length ? shape.decisions.map((item) => `- ${item}`) : ["- None recorded."]),
    "",
    "## Constraints",
    ...(shape.constraints.length ? shape.constraints.map((item) => `- ${item}`) : ["- None recorded."]),
    "",
    "## Open Tasks",
    ...(shape.openTasks.length ? shape.openTasks.map((item) => `- ${item}`) : ["- None recorded."]),
    "",
    "## Tools / Sources To Consult",
    ...(shape.relevantTools.length ? shape.relevantTools.map((item) => `- ${item}`) : ["- None recorded."]),
    "",
    "## What This Chat Should Do First",
    shape.firstAction ?? "Review the project state and continue from the highest-priority open task."
  ].join("\n")
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
}) {
  const result = await runGeminiJsonWithFallback<BootstrapModelShape>({
    primaryModel: GEMINI_MODELS.bootstrap.primary,
    fallbackModel: GEMINI_MODELS.bootstrap.fallback,
    maxInputTokens: GEMINI_MODELS.bootstrap.maxInputTokens,
    maxOutputTokens: GEMINI_MODELS.bootstrap.maxOutputTokens,
    systemInstruction:
      "You write fresh-chat bootstraps for AI tools. Return only JSON. Prefer durable project state, clear tasks, and concise sections over transcript detail.",
    prompt: [
      "Return a JSON object with these keys exactly:",
      "projectOverview, currentObjective, recentProgress, decisions, constraints, openTasks, relevantTools, firstAction.",
      "Do not include markdown in the JSON values.",
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

  const latest = await repositories.bootstrapPackets.getLatest(projectId, profile.id, parsed.kind)
  if (latest && !state?.dirty && !parsed.deep) {
    return {
      status: "ready",
      packet: latest,
      reason: null,
      resolvedTargetProfileKey: parsed.targetProfileKey,
      stateStatus
    }
  }

  const preferredRenderer = inferRenderer(parsed, state)
  const deterministic = deterministicBootstrap(state, digests, profile)

  let shape = deterministic
  let renderer: BootstrapPacketRow["renderer"] = "deterministic"
  let actualModel = "deterministic"
  let primaryModel = preferredRenderer === "gemini" ? GEMINI_MODELS.bootstrap.primary : "deterministic"
  let fallbackUsed = false
  let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

  if (preferredRenderer === "gemini") {
    try {
      const generated = await generateGeminiBootstrap({ state, digests, profile })
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
    content: renderBootstrapMarkdown(shape, profile),
    structuredSnapshot: { ...shape },
    renderer,
    generationMetadata: {
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
