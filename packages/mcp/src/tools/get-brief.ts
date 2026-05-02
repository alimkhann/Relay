import type { RelayProjectResolutionResult } from "@relay/shared"
import { z } from "zod"
import type { RelayClient } from "../client.js"

export const getBriefSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  kind: z
    .enum(["quick_continuity", "fresh_chat_bootstrap"])
    .optional()
    .describe("Brief kind: quick_continuity for short updates, fresh_chat_bootstrap for full context"),
  targetProfileKey: z
    .string()
    .optional()
    .describe("Target profile key for brief formatting"),
  generate: z
    .boolean()
    .default(true)
    .describe("Whether to generate a new brief or fetch the latest cached one"),
  include: z
    .array(z.enum(["state", "memory"]))
    .optional()
    .describe("Append raw JSON sections after the markdown brief: 'state' for effective project state, 'memory' for memory items"),
  since: z
    .string()
    .datetime()
    .optional()
    .describe("Only include context updated since this ISO timestamp."),
  syncSurface: z
    .enum(["mcp", "cli", "chatgpt", "claude", "codex", "opencode", "gemini", "cursor", "warp", "windsurf", "antigravity", "grok", "perplexity", "deepseek"])
    .optional()
    .describe("Surface label used to update last-sync markers after a successful brief fetch.")
})

interface BootstrapResponse {
  status: "ready" | "pending"
  packet: { id: string; kind: string; content: string; targetProfileKey: string; createdAt: string } | null
  reason: string | null
  resolvedTargetProfileKey: string
  stateStatus: Record<string, unknown>
}

interface LatestResponse {
  packet: { id: string; kind: string; content: string; targetProfileKey: string; createdAt: string } | null
}

interface DashboardResponse {
  project: {
    id: string
    name: string
    slug: string
  }
  dashboard: {
    projectState: Record<string, unknown> | null
    derivedProjectState?: Record<string, unknown> | null
    stateStatus?: {
      rawCapturePresent?: boolean
      digestStatus?: string
      projectStateReady?: boolean
    }
    memory: Array<{
      id: string
      type: string
      title: string | null
      content: string
      pinned: boolean
      updatedAt: string
    }>
  }
}

function toStructuredRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

function buildResolvedProjectSelection(
  args: z.infer<typeof getBriefSchema>,
  resolvedProjectId: string,
  resolution?: RelayProjectResolutionResult,
) {
  return resolution ?? {
    status: "resolved" as const,
    projectId: resolvedProjectId,
    source: args.projectId ? "explicit" : "cached",
    confidence: 1,
    needsUserIntervention: false,
  }
}

async function appendIncludeSections(
  client: RelayClient,
  resolvedProjectId: string,
  briefText: string,
  include: Array<"state" | "memory">
): Promise<string> {
  if (include.length === 0) return briefText

  try {
    const data = await client.get<DashboardResponse>(`/api/projects/${resolvedProjectId}`)
    const sections: string[] = [briefText, "", "---"]

    if (include.includes("state") && data.dashboard.projectState) {
      sections.push("")
      sections.push("## Raw State (JSON)")
      sections.push(JSON.stringify(data.dashboard.projectState, null, 2))
    }

    if (include.includes("memory") && data.dashboard.memory.length > 0) {
      sections.push("")
      sections.push("## Memory Items (JSON)")
      sections.push(JSON.stringify(data.dashboard.memory, null, 2))
    }

    return sections.join("\n")
  } catch {
    return briefText
  }
}

function isStateDirty(state: Record<string, unknown> | null | undefined) {
  return Boolean(state && typeof state["dirty"] === "boolean" && state["dirty"])
}

async function resolveBriefMode(
  client: RelayClient,
  resolvedProjectId: string,
  args: z.infer<typeof getBriefSchema>,
) {
  const syncSurface = args.syncSurface ?? client.getDefaultSyncSurface()
  const defaultSince = await client.getDefaultSince(resolvedProjectId, args.since)

  if (args.kind) {
    return {
      kind: args.kind,
      since: args.kind === "quick_continuity" ? defaultSince : args.since,
      syncSurface,
    }
  }

  try {
    const data = await client.get<DashboardResponse>(`/api/projects/${resolvedProjectId}`)
    const state = data.dashboard.projectState ?? data.dashboard.derivedProjectState ?? null
    const stateStatus = data.dashboard.stateStatus
    const isQuickCandidate =
      Boolean(defaultSince) &&
      Boolean(stateStatus?.projectStateReady) &&
      !isStateDirty(state) &&
      stateStatus?.rawCapturePresent !== true &&
      !["pending", "running", "failed", "timed_out"].includes(stateStatus?.digestStatus ?? "idle")

    return {
      kind: isQuickCandidate ? "quick_continuity" as const : "fresh_chat_bootstrap" as const,
      since: isQuickCandidate ? defaultSince : args.since,
      syncSurface,
    }
  } catch {
    return {
      kind: defaultSince ? "quick_continuity" as const : "fresh_chat_bootstrap" as const,
      since: defaultSince ?? args.since,
      syncSurface,
    }
  }
}

async function getDashboardSnapshot(
  client: RelayClient,
  resolvedProjectId: string,
) {
  try {
    return await client.get<DashboardResponse>(`/api/projects/${resolvedProjectId}`)
  } catch {
    return null
  }
}

function getDriftHint(data: DashboardResponse | null) {
  if (!data) return null
  const state = data.dashboard.projectState ?? data.dashboard.derivedProjectState ?? null
  const stateStatus = data.dashboard.stateStatus

  if (isStateDirty(state)) {
    return "Relay project state is marked dirty, so treat this brief as provisional and inspect context before mutating."
  }

  if (stateStatus?.rawCapturePresent === true) {
    return "Recent raw captures are present and may not be fully reflected in the generated brief yet."
  }

  if (["pending", "running", "failed", "timed_out"].includes(stateStatus?.digestStatus ?? "idle")) {
    return `Digest status is ${stateStatus?.digestStatus ?? "unknown"}, so newer continuity may still be settling.`
  }

  return null
}

function buildResumeMetadata(
  data: DashboardResponse | null,
  options: {
    targetProfileKey: string
    kind: "quick_continuity" | "fresh_chat_bootstrap"
    syncSurface: z.infer<typeof getBriefSchema>["syncSurface"]
    since?: string
  },
) {
  const state = data?.dashboard.projectState ?? data?.dashboard.derivedProjectState ?? null
  const decisions = Array.isArray(state?.decisions)
    ? state.decisions.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 4)
    : []

  return {
    project: data?.project ?? null,
    latestDurableDecisions: decisions,
    freshness: {
      driftHint: getDriftHint(data),
      stateStatus: data?.dashboard.stateStatus ?? null,
      since: options.since ?? null,
    },
    briefPolicy: {
      targetProfileKey: options.targetProfileKey,
      kind: options.kind,
      syncSurface: options.syncSurface ?? null,
      resumeGuidance:
        "If this brief is coherent and on the correct project, do not call list_projects, set_current_project, get_project_state, list_sessions, list_briefs, or search_context just to restate the same continuity.",
    },
  }
}

export async function getBrief(
  client: RelayClient,
  args: z.infer<typeof getBriefSchema>,
  resolvedProjectId: string,
  resolution?: RelayProjectResolutionResult
) {
  const resolvedTargetProfileKey = args.targetProfileKey ?? client.getDefaultTargetProfileKey()
  const { kind, since, syncSurface } = await resolveBriefMode(client, resolvedProjectId, args)
  const dashboardSnapshot = await getDashboardSnapshot(client, resolvedProjectId)
  const projectResolution = buildResolvedProjectSelection(args, resolvedProjectId, resolution)
  const resumeMetadata = buildResumeMetadata(dashboardSnapshot, {
    targetProfileKey: resolvedTargetProfileKey,
    kind,
    syncSurface,
    since,
  })

  if (args.generate) {
    const data = await client.post<BootstrapResponse>(
      `/api/projects/${resolvedProjectId}/bootstrap`,
        {
          targetProfileKey: resolvedTargetProfileKey,
          kind,
          since,
          syncSurface
        }
      )

    if (data.status === "pending") {
    return {
      content: [
        {
          type: "text" as const,
          text: `Brief generation is in progress. ${data.reason ?? "Please try again in a moment."}`
        }
      ],
      structuredContent: toStructuredRecord({
        projectResolution,
        brief: {
          status: "pending",
          kind,
          syncSurface,
          since: since ?? null,
          targetProfileKey: data.resolvedTargetProfileKey,
        },
        resumeMetadata,
      }),
    }
  }

    if (!data.packet) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No brief available yet. The project may not have enough context captured."
        }
      ],
      structuredContent: toStructuredRecord({
        projectResolution,
        brief: {
          status: "missing",
          kind,
          syncSurface,
          since: since ?? null,
          targetProfileKey: data.resolvedTargetProfileKey,
        },
        resumeMetadata,
      }),
    }
  }

    let text = data.packet.content
    if (args.include?.length) {
      text = await appendIncludeSections(client, resolvedProjectId, text, args.include)
    }

    return {
      content: [{ type: "text" as const, text }],
      structuredContent: toStructuredRecord({
        projectResolution,
        brief: {
          status: "ready",
          kind,
          syncSurface,
          since: since ?? null,
          packetId: data.packet.id,
          targetProfileKey: data.packet.targetProfileKey,
        },
        resumeMetadata: {
          ...resumeMetadata,
          briefPolicy: {
            ...resumeMetadata.briefPolicy,
            targetProfileKey: data.packet.targetProfileKey,
          },
        },
      }),
    }
  }

  // Fetch latest cached brief
  const data = await client.get<LatestResponse>(
    `/api/projects/${resolvedProjectId}/bootstrap/latest?targetProfileKey=${encodeURIComponent(resolvedTargetProfileKey)}&kind=${encodeURIComponent(kind)}&syncSurface=${encodeURIComponent(syncSurface)}`
  )

  if (!data.packet) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No cached brief available. Try calling with generate=true to create one."
        }
      ],
      structuredContent: toStructuredRecord({
        projectResolution,
        brief: {
          status: "missing",
          kind,
          syncSurface,
          since: since ?? null,
        },
        resumeMetadata,
      }),
    }
  }

  let text = data.packet.content
  if (args.include?.length) {
    text = await appendIncludeSections(client, resolvedProjectId, text, args.include)
  }

  return {
    content: [{ type: "text" as const, text }],
    structuredContent: toStructuredRecord({
      projectResolution,
      brief: {
        status: "ready",
        kind,
        syncSurface,
        since: since ?? null,
        packetId: data.packet.id,
        targetProfileKey: data.packet.targetProfileKey,
      },
      resumeMetadata: {
        ...resumeMetadata,
        briefPolicy: {
          ...resumeMetadata.briefPolicy,
          targetProfileKey: data.packet.targetProfileKey,
        },
      },
    }),
  }
}
