import type { ContextFormatter } from "../base/types"
import { groupMemory, summarizeCurrentState } from "../base/context-formatter"

export const claudeCodeFormatter: ContextFormatter = {
  key: "claude_code_build",
  format(input) {
    const grouped = groupMemory(input.memoryItems)
    return [
      `Project: ${input.project.name}`,
      "",
      "Current state:",
      summarizeCurrentState(input.memoryItems, input.recentSessions),
      "",
      "Important decisions:",
      ...(grouped.decision ?? []).map((item) => `- ${item.content}`),
      "",
      "Constraints:",
      ...(grouped.constraint ?? []).map((item) => `- ${item.content}`),
      "",
      "Next tasks:",
      ...(grouped.task ?? []).map((item) => `- ${item.content}`)
    ].join("\n")
  }
}
