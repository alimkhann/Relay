import { ChatgptAdapter } from "../chatgpt/adapter"
import { ClaudeAdapter } from "../claude/adapter"
import { CodexAdapter } from "../codex/adapter"
import { DeepseekAdapter } from "../deepseek/adapter"
import { GeminiAdapter } from "../gemini/adapter"
import { GrokAdapter } from "../grok/adapter"
import { PerplexityAdapter } from "../perplexity/adapter"

const adapters = [
  new CodexAdapter(),
  new ChatgptAdapter(),
  new PerplexityAdapter(),
  new ClaudeAdapter(),
  new GeminiAdapter(),
  new GrokAdapter(),
  new DeepseekAdapter(),
]

export function resolveAdapter(url: string) {
  return adapters.find((adapter) => adapter.canHandle(url)) ?? null
}

export function listAdapters() {
  return adapters
}
