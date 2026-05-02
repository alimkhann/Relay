import type { SyncSurface } from "../types/database"

type SupportedTargetProfileKey =
  | "chatgpt_planning"
  | "perplexity_research"
  | "claude_code_build"
  | "codex_implementation"
  | "gemini_exploration"
  | "grok_conversation"
  | "deepseek_reasoning"

interface ResolveDefaultTargetProfileInput {
  syncSurface?: SyncSurface | null
  agentName?: string | null
  clientName?: string | null
}

export function resolveDefaultTargetProfileKey(
  input: ResolveDefaultTargetProfileInput = {},
): SupportedTargetProfileKey {
  const agent = input.agentName?.toLowerCase() ?? ""
  const client = input.clientName?.toLowerCase() ?? ""
  const syncSurface = input.syncSurface?.toLowerCase() ?? ""

  if (agent.includes("codex") || client.includes("codex") || syncSurface === "codex") {
    return "codex_implementation"
  }

  if (agent.includes("claude") || client.includes("claude") || syncSurface === "claude") {
    return "claude_code_build"
  }

  if (agent.includes("gemini") || client.includes("gemini") || syncSurface === "gemini") {
    return "gemini_exploration"
  }

  if (agent.includes("perplexity") || client.includes("perplexity") || syncSurface === "perplexity") {
    return "perplexity_research"
  }

  if (agent.includes("grok") || client.includes("grok") || syncSurface === "grok") {
    return "grok_conversation"
  }

  if (agent.includes("deepseek") || client.includes("deepseek") || syncSurface === "deepseek") {
    return "deepseek_reasoning"
  }

  return "chatgpt_planning"
}
