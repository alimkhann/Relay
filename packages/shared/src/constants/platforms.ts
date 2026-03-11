export const supportedPlatforms = ["chatgpt", "perplexity", "claude", "codex"] as const

export const targetPlatforms = ["chatgpt", "perplexity", "claude_code", "codex"] as const

export const bootstrapPacketKinds = ["quick_continuity", "fresh_chat_bootstrap"] as const

export const aiRenderers = ["deterministic", "gemini"] as const

export const aiJobKinds = ["session_digest", "fresh_chat_bootstrap", "quick_continuity"] as const

export const aiJobStatuses = ["pending", "running", "completed", "failed"] as const

export const memoryItemTypes = [
  "note",
  "decision",
  "constraint",
  "requirement",
  "task",
  "artifact"
] as const

export const sourceTurnRoles = ["user", "assistant", "system", "unknown"] as const

export const bindingKinds = ["tab", "domain", "manual"] as const
