import type { ContextFormatter } from "../base/types"
import { formatRecentTurns, summarizeCurrentState } from "../base/context-formatter"

export const codexFormatter: ContextFormatter = {
  key: "codex_implementation",
  format(input) {
    return [
      `Project: ${input.project.name}`,
      "",
      "Current goal:",
      summarizeCurrentState(input.memoryItems, input.recentTurns, input.recentSessions),
      "",
      "Implementation notes:",
      ...input.recentSessions.slice(0, 2).map((session) => `- ${session.title ?? session.url}`),
      "",
      "Known constraints:",
      ...input.memoryItems.filter((item) => item.type === "constraint").map((item) => `- ${item.content}`),
      "",
      "Recent captured turns:",
      ...formatRecentTurns(input.recentTurns)
    ].join("\n")
  }
}
