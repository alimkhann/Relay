export const supportedPlatforms = ["chatgpt", "perplexity", "claude"] as const

export const targetPlatforms = ["chatgpt", "perplexity", "claude_code", "codex"] as const

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
