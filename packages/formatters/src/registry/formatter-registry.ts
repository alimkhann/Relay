import type { ContextFormatter } from "../base/types"
import { chatgptPlanningFormatter } from "../chatgpt-planning/formatter"
import { claudeCodeFormatter } from "../claude-code/formatter"
import { codexFormatter } from "../codex/formatter"
import { deepseekReasoningFormatter } from "../deepseek-reasoning/formatter"
import { geminiExplorationFormatter } from "../gemini-exploration/formatter"
import { grokConversationFormatter } from "../grok-conversation/formatter"
import { perplexityResearchFormatter } from "../perplexity-research/formatter"

const formatters: ContextFormatter[] = [
  chatgptPlanningFormatter,
  perplexityResearchFormatter,
  claudeCodeFormatter,
  codexFormatter,
  geminiExplorationFormatter,
  grokConversationFormatter,
  deepseekReasoningFormatter,
]

export function getFormatter(key: string): ContextFormatter {
  const formatter = formatters.find((item) => item.key === key)

  if (!formatter) {
    throw new Error(`Unknown formatter key: ${key}`)
  }

  return formatter
}

export function listFormatters(): ContextFormatter[] {
  return formatters
}
