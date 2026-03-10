import type { ContextFormatter } from "../base/types"
import { summarizeCurrentState } from "../base/context-formatter"

export const perplexityResearchFormatter: ContextFormatter = {
  key: "perplexity_research",
  format(input) {
    return [
      `I am working on ${input.project.name}.`,
      "",
      "What I already know:",
      summarizeCurrentState(input.memoryItems),
      "",
      "Open questions:",
      ...input.memoryItems.filter((item) => item.type === "task").map((item) => `- ${item.content}`),
      "",
      "Avoid repeating:",
      ...input.memoryItems.filter((item) => item.type === "constraint").map((item) => `- ${item.content}`)
    ].join("\n")
  }
}
