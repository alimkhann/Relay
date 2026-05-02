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

/**
 * Hostnames we *expect* to resolve to an adapter. If resolveAdapter returns
 * null for a URL on one of these hosts, something in the adapter chain has
 * broken (upstream DOM change, routing regression, etc). Log a warning so
 * DevTools picks it up instead of silently no-op'ing the capture.
 */
const EXPECTED_ADAPTER_HOST_PATTERN =
  /(^|\.)(chatgpt|openai|claude|perplexity|gemini|grok|deepseek)\.(com|ai|io)$/i

const recentMisses = new Set<string>()

function shouldReportMiss(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    if (!EXPECTED_ADAPTER_HOST_PATTERN.test(hostname)) return false
    if (recentMisses.has(hostname)) return false
    recentMisses.add(hostname)
    return true
  } catch {
    return false
  }
}

export function resolveAdapter(url: string) {
  const adapter = adapters.find((adapter) => adapter.canHandle(url)) ?? null
  if (!adapter && shouldReportMiss(url)) {
    console.warn(
      `[relay-adapters] resolveAdapter returned null for a known AI host (${url}). ` +
        "Adapter registry may be out of date.",
    )
  }
  return adapter
}

export function listAdapters() {
  return adapters
}
