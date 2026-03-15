import type { ContextFormatter } from "../base/types"
import { formatRecentTurns, groupMemory, summarizeCurrentState } from "../base/context-formatter"

export const deepseekReasoningFormatter: ContextFormatter = {
  key: "deepseek_reasoning",
  format(input) {
    const grouped = groupMemory(input.memoryItems)
    return [
      `Project: ${input.project.name}`,
      "",
      "Current goal:",
      summarizeCurrentState(grouped.requirement ?? input.memoryItems, input.recentTurns, input.recentSessions),
      "",
      "Known constraints:",
      ...(grouped.constraint ?? []).map((item) => `- ${item.content}`),
      "",
      "Important decisions:",
      ...(grouped.decision ?? []).map((item) => `- ${item.content}`),
      "",
      "Next tasks:",
      ...(grouped.task ?? []).map((item) => `- ${item.content}`),
      "",
      "Recent captured turns:",
      ...formatRecentTurns(input.recentTurns)
    ]
      .filter(Boolean)
      .join("\n")
  }
}
