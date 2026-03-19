import { z } from "zod"
import type { RelayClient } from "../client.js"

export const getBriefSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  kind: z
    .enum(["quick_continuity", "fresh_chat_bootstrap"])
    .default("fresh_chat_bootstrap")
    .describe("Brief kind: quick_continuity for short updates, fresh_chat_bootstrap for full context"),
  targetProfileKey: z
    .string()
    .default("claude_code_build")
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
  dashboard: {
    projectState: Record<string, unknown> | null
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

export async function getBrief(
  client: RelayClient,
  args: z.infer<typeof getBriefSchema>,
  resolvedProjectId: string
) {
  const syncSurface = args.syncSurface ?? client.getDefaultSyncSurface()

  if (args.generate) {
    const data = await client.post<BootstrapResponse>(
      `/api/projects/${resolvedProjectId}/bootstrap`,
        {
          targetProfileKey: args.targetProfileKey,
          kind: args.kind,
          since: args.since,
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
        ]
      }
    }

    if (!data.packet) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No brief available yet. The project may not have enough context captured."
          }
        ]
      }
    }

    let text = data.packet.content
    if (args.include?.length) {
      text = await appendIncludeSections(client, resolvedProjectId, text, args.include)
    }

    return {
      content: [{ type: "text" as const, text }]
    }
  }

  // Fetch latest cached brief
  const data = await client.get<LatestResponse>(
    `/api/projects/${resolvedProjectId}/bootstrap/latest?targetProfileKey=${encodeURIComponent(args.targetProfileKey)}&kind=${encodeURIComponent(args.kind)}&syncSurface=${encodeURIComponent(syncSurface)}`
  )

  if (!data.packet) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No cached brief available. Try calling with generate=true to create one."
        }
      ]
    }
  }

  let text = data.packet.content
  if (args.include?.length) {
    text = await appendIncludeSections(client, resolvedProjectId, text, args.include)
  }

  return {
    content: [{ type: "text" as const, text }]
  }
}
