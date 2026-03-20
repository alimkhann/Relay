import type { RelayCliAnalytics } from "../analytics"
import { RelayApiClient } from "../api-client"
import { requireConfig } from "../config"

interface BootstrapResponse {
  status: "ready" | "pending"
  packet: { content: string } | null
  reason: string | null
}

export async function runBriefCommand(args: string[], options: {
  analytics?: RelayCliAnalytics
  projectId?: string
  kind?: string
  targetProfileKey?: string
  since?: string
} = {}) {
  const config = await requireConfig()
  await options.analytics?.identify(config.apiBase, config.token)
  const projectId = options.projectId ?? args[0] ?? config.projectId
  if (!projectId) {
    throw new Error("No project selected. Run `relay projects switch <project>` or pass a project ID.")
  }

  const client = new RelayApiClient(config.apiBase, config.token)
  const result = await client.post<BootstrapResponse>(`/api/projects/${projectId}/bootstrap`, {
    targetProfileKey: options.targetProfileKey ?? "claude_code_build",
    kind: options.kind === "quick_continuity" ? "quick_continuity" : "fresh_chat_bootstrap",
    ...(options.since ? { since: options.since } : {})
  })

  if (result.status === "pending" || !result.packet) {
    throw new Error(result.reason ?? "Brief generation is still pending.")
  }

  options.analytics?.capture("cli_brief_read", {
    project_id: projectId,
    kind: options.kind === "quick_continuity" ? "quick_continuity" : "fresh_chat_bootstrap",
    target_profile_key: options.targetProfileKey ?? "claude_code_build",
  })
  console.log(result.packet.content)
}
