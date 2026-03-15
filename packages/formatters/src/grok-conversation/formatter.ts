import type { ContextFormatter } from "../base/types"
import { formatRecentTurns, groupMemory, summarizeCurrentState } from "../base/context-formatter"

export const grokConversationFormatter: ContextFormatter = {
  key: "grok_conversation",
  format(input) {
    const grouped = groupMemory(input.memoryItems)
    return [
      `Project: ${input.project.name}`,
      "",
      "Current goal:",
      summarizeCurrentState(grouped.requirement ?? input.memoryItems, input.recentTurns, input.recentSessions),
      "",
      "Important decisions:",
      ...(grouped.decision ?? []).map((item) => `- ${item.content}`),
      "",
      "Constraints:",
      ...(grouped.constraint ?? []).map((item) => `- ${item.content}`),
      "",
      "Next tasks:",
      ...(grouped.task ?? []).map((item) => `- ${item.content}`),
      "",
      "Relevant recent thread:",
      ...formatRecentTurns(input.recentTurns)
    ]
      .filter(Boolean)
      .join("\n")
  }
}
