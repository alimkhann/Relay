export type RelayTargetMode = "auto" | "manual"

export function inferTargetProfile(platform?: string) {
  switch (platform) {
    case "perplexity":
      return "perplexity_research"
    case "claude":
      return "claude_code_build"
    case "codex":
      return "codex_implementation"
    case "gemini":
      return "gemini_exploration"
    case "grok":
      return "grok_conversation"
    case "deepseek":
      return "deepseek_reasoning"
    case "chatgpt":
    default:
      return "chatgpt_planning"
  }
}

export function resolveTargetProfile(input: {
  platform?: string
  targetMode?: RelayTargetMode
  manualTargetProfileKey?: string
}) {
  if (input.targetMode === "manual" && input.manualTargetProfileKey) {
    return input.manualTargetProfileKey
  }

  return inferTargetProfile(input.platform)
}
