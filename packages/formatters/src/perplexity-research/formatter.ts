import type { ContextFormatter } from "../base/types"
import { formatRecentTurns, summarizeCurrentState } from "../base/context-formatter"

export const perplexityResearchFormatter: ContextFormatter = {
  key: "perplexity_research",
  format(input) {
    return [
      `I am working on ${input.project.name}.`,
      "",
      "What I already know:",
      summarizeCurrentState(input.memoryItems, input.recentTurns, input.recentSessions),
      "",
      "Avoid repeating:",
      ...input.memoryItems.filter((item) => item.type === "decision").map((item) => `- ${item.content}`),
      "",
      "Open questions:",
      ...input.memoryItems.filter((item) => item.type === "task").map((item) => `- ${item.content}`),
      "",
      "Known constraints:",
      ...input.memoryItems.filter((item) => item.type === "constraint").map((item) => `- ${item.content}`),
      "",
      "Recent thread context:",
      ...formatRecentTurns(input.recentTurns)
    ].join("\n")
  }
}
