import type { ContextFormatter } from "../base/types"
import { groupMemory, summarizeCurrentState } from "../base/context-formatter"

export const chatgptPlanningFormatter: ContextFormatter = {
  key: "chatgpt_planning",
  format(input) {
    const grouped = groupMemory(input.memoryItems)
    return [
      `Project: ${input.project.name}`,
      "",
      "Current goal:",
      summarizeCurrentState(grouped.requirement ?? input.memoryItems),
      "",
      "Important decisions:",
      ...(grouped.decision ?? []).map((item) => `- ${item.content}`),
      "",
      "Constraints:",
      ...(grouped.constraint ?? []).map((item) => `- ${item.content}`),
      "",
      "Next tasks:",
      ...(grouped.task ?? []).map((item) => `- ${item.content}`)
    ]
      .filter(Boolean)
      .join("\n")
  }
}
