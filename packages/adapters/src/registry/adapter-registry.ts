import { ChatgptAdapter } from "../chatgpt/adapter"
import { ClaudeAdapter } from "../claude/adapter"
import { CodexAdapter } from "../codex/adapter"
import { PerplexityAdapter } from "../perplexity/adapter"

const adapters = [new CodexAdapter(), new ChatgptAdapter(), new PerplexityAdapter(), new ClaudeAdapter()]

export function resolveAdapter(url: string) {
  return adapters.find((adapter) => adapter.canHandle(url)) ?? null
}

export function listAdapters() {
  return adapters
}
