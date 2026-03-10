import type { ContextFormatter } from "../base/types"
import { summarizeCurrentState } from "../base/context-formatter"

export const codexFormatter: ContextFormatter = {
  key: "codex_implementation",
  format(input) {
    return [
      `Project: ${input.project.name}`,
      "",
      "Current goal:",
      summarizeCurrentState(input.memoryItems),
      "",
      "Known constraints:",
      ...input.memoryItems.filter((item) => item.type === "constraint").map((item) => `- ${item.content}`),
      "",
      "Implementation notes:",
      ...input.recentSessions.slice(0, 2).map((session) => `- ${session.title ?? session.url}`)
    ].join("\n")
  }
}
