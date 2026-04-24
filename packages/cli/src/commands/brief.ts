import type { RelayCliAnalytics } from "../analytics"
import { RelayApiClient, requireConfig } from "@relay/cli-core"
import { resolveDefaultTargetProfileKey } from "@relay/shared"

interface BootstrapResponse {
  status: "ready" | "pending"
  packet: { content: string } | null
  reason: string | null
}

function detectDefaultTargetProfileKey() {
  return resolveDefaultTargetProfileKey({
    syncSurface:
      process.env["CODEX_CI"] || process.env["CODEX_SHELL"] || process.env["CODEX_THREAD_ID"]
        ? "codex"
        : process.env["CLAUDECODE"] || process.env["CLAUDE_CODE"]
          ? "claude"
          : process.env["GEMINI_CLI"]
            ? "gemini"
            : "mcp",
    agentName:
      process.env["CODEX_CI"] || process.env["CODEX_SHELL"] || process.env["CODEX_THREAD_ID"]
        ? "codex"
        : process.env["CLAUDECODE"] || process.env["CLAUDE_CODE"]
          ? "claude-code"
          : process.env["GEMINI_CLI"]
            ? "gemini-cli"
            : "relay-cli",
    clientName: "relay-cli",
  })
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
  const targetProfileKey = options.targetProfileKey ?? detectDefaultTargetProfileKey()
  const result = await client.post<BootstrapResponse>(`/api/projects/${projectId}/bootstrap`, {
    targetProfileKey,
    kind: options.kind === "quick_continuity" ? "quick_continuity" : "fresh_chat_bootstrap",
    ...(options.since ? { since: options.since } : {})
  })

  if (result.status === "pending" || !result.packet) {
    throw new Error(result.reason ?? "Brief generation is still pending.")
  }

  options.analytics?.capture("cli_brief_read", {
    project_id: projectId,
    kind: options.kind === "quick_continuity" ? "quick_continuity" : "fresh_chat_bootstrap",
    target_profile_key: targetProfileKey,
  })
  console.log(result.packet.content)
}
