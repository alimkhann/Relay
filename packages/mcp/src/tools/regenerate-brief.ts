import { z } from "zod"
import type { RelayClient } from "../client.js"

export const regenerateBriefSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  kind: z.enum(["quick_continuity", "fresh_chat_bootstrap"]).default("fresh_chat_bootstrap").describe("Brief kind to regenerate."),
  targetProfileKey: z.string().optional().describe("Target profile key for the regenerated brief."),
  since: z.string().datetime().optional().describe("Only include context updated since this ISO timestamp."),
  syncSurface: z.enum(["mcp", "cli", "chatgpt", "claude", "codex", "opencode", "gemini", "cursor", "warp", "windsurf", "antigravity", "grok", "perplexity", "deepseek"]).optional().describe("Surface label used to update last-sync markers."),
})

export async function regenerateBrief(
  client: RelayClient,
  args: z.infer<typeof regenerateBriefSchema>,
  resolvedProjectId: string,
) {
  const data = await client.post<{
    status: "ready" | "pending"
    packet: { id: string; content: string } | null
    reason: string | null
  }>(`/api/projects/${resolvedProjectId}/bootstrap`, {
    targetProfileKey: args.targetProfileKey ?? client.getDefaultTargetProfileKey(),
    kind: args.kind,
    since: args.since,
    syncSurface: args.syncSurface ?? client.getDefaultSyncSurface(),
  })

  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }]
  }
}
