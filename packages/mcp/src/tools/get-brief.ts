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
    .describe("Whether to generate a new brief or fetch the latest cached one")
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

export async function getBrief(
  client: RelayClient,
  args: z.infer<typeof getBriefSchema>,
  resolvedProjectId: string
) {
  if (args.generate) {
    const data = await client.post<BootstrapResponse>(
      `/api/projects/${resolvedProjectId}/bootstrap`,
      {
        targetProfileKey: args.targetProfileKey,
        kind: args.kind
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

    return {
      content: [{ type: "text" as const, text: data.packet.content }]
    }
  }

  // Fetch latest cached brief
  const data = await client.get<LatestResponse>(
    `/api/projects/${resolvedProjectId}/bootstrap/latest?targetProfileKey=${encodeURIComponent(args.targetProfileKey)}&kind=${encodeURIComponent(args.kind)}`
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

  return {
    content: [{ type: "text" as const, text: data.packet.content }]
  }
}
