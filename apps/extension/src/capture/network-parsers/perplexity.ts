/**
 * Perplexity network response parser.
 *
 * Perplexity uses a REST endpoint to load thread data:
 * GET /api/query/{threadId} or similar patterns that return
 * the full search thread with query/answer pairs.
 *
 * Response shape varies but typically:
 * {
 *   query_str: string,
 *   text: string,         // assistant answer
 *   thread: [
 *     { query_str: string, text: string, ... }
 *   ]
 * }
 *
 * Also intercepts the thread detail endpoint:
 * GET /api/v1/thread/{threadId}
 * {
 *   entries: [
 *     { query: string, answer: string, ... }
 *   ]
 * }
 */

import type { NetworkTurn, InterceptMatch } from "../network-types"

const THREAD_URL_RE =
  /\/api\/(?:v1\/)?(?:query|thread)\/([a-f0-9-]+)(?:\?|$)/i

// Also match the search page load which fetches thread data
const SEARCH_URL_RE =
  /\/rest\/sse\/perplexity_ask|\/api\/ask/

export function matchPerplexity(url: string): InterceptMatch | null {
  const threadMatch = THREAD_URL_RE.exec(url)
  if (threadMatch) {
    return { platform: "perplexity", conversationId: threadMatch[1] ?? null }
  }

  if (SEARCH_URL_RE.test(url)) {
    return { platform: "perplexity", conversationId: null }
  }

  return null
}

interface PerplexityEntry {
  query_str?: string
  query?: string
  text?: string
  answer?: string
}

interface PerplexityThreadResponse {
  thread?: PerplexityEntry[]
  entries?: PerplexityEntry[]
  query_str?: string
  text?: string
}

function getQuery(entry: PerplexityEntry): string {
  return (entry.query_str ?? entry.query ?? "").trim()
}

function getAnswer(entry: PerplexityEntry): string {
  return (entry.text ?? entry.answer ?? "").trim()
}

export function parsePerplexityThread(
  data: unknown,
): { title: string | null; turns: NetworkTurn[] } | null {
  if (!data || typeof data !== "object") return null

  const resp = data as PerplexityThreadResponse
  const entries = resp.thread ?? resp.entries

  // Case 1: Array of thread entries
  if (entries && Array.isArray(entries) && entries.length > 0) {
    const turns: NetworkTurn[] = []
    let turnIndex = 0

    for (const entry of entries) {
      const query = getQuery(entry)
      if (query) {
        turns.push({ role: "user", content: query, turnIndex })
        turnIndex++
      }

      const answer = getAnswer(entry)
      if (answer) {
        turns.push({ role: "assistant", content: answer, turnIndex })
        turnIndex++
      }
    }

    const title = turns.length > 0 ? getQuery(entries[0]!) || null : null
    return { title, turns }
  }

  // Case 2: Single query/answer response
  const query = resp.query_str
  const answer = resp.text
  if (typeof query === "string" && typeof answer === "string") {
    const turns: NetworkTurn[] = []
    if (query.trim()) {
      turns.push({ role: "user", content: query.trim(), turnIndex: 0 })
    }
    if (answer.trim()) {
      turns.push({ role: "assistant", content: answer.trim(), turnIndex: 1 })
    }
    if (turns.length > 0) {
      return { title: query.trim() || null, turns }
    }
  }

  return null
}
