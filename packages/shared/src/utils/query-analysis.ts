import { resolvePrimaryTemporalPoint } from "./temporal-normalization"

export type QueryStateIntent = "current" | "historical" | "general"
export type QueryReasoningMode =
  | "simple_fact"
  | "current_state"
  | "historical_state"
  | "temporal_compare"
  | "temporal_arithmetic"
  | "aggregation"
  | "preference"

export interface QueryAnalysisCore {
  normalizedQuery: string
  stateIntent: QueryStateIntent
  reasoningMode: QueryReasoningMode
  historicalAt: string | null
  dateRange: { from?: string | null; to?: string | null } | undefined
  asksCountOrTotal: boolean
  asksOrder: boolean
  asksDuration: boolean
  extractedEntities: string[]
  isMultiHop: boolean
}

function extractHistoricalAt(query: string, referenceDate?: string | null): string | null {
  return resolvePrimaryTemporalPoint(query, referenceDate)?.isoDate ?? null
}

const STOP_WORDS = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall", "can", "need", "dare", "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "out", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just", "because", "but", "and", "or", "if", "while", "about", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "it", "its", "my", "we", "our", "your", "they", "them", "their", "i", "me", "he", "she", "his", "her", "up", "down"])

function extractEntities(query: string): string[] {
  const entities: string[] = []
  const seen = new Set<string>()

  // Quoted strings: "auth middleware", 'billing service'
  for (const match of query.matchAll(/["']([^"']{2,40})["']/g)) {
    const entity = match[1]!.trim()
    const key = entity.toLowerCase()
    if (!seen.has(key)) { seen.add(key); entities.push(entity) }
  }

  // PascalCase / camelCase identifiers: AuthMiddleware, userId, PostgreSQL
  for (const match of query.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+|[a-z]+[A-Z][a-zA-Z]*)\b/g)) {
    const entity = match[1]!
    const key = entity.toLowerCase()
    if (!seen.has(key)) { seen.add(key); entities.push(entity) }
  }

  // Capitalized multi-word phrases: "Auth Service", "Rate Limiter" (2-3 words)
  for (const match of query.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g)) {
    const entity = match[1]!
    const key = entity.toLowerCase()
    if (!seen.has(key) && !STOP_WORDS.has(key)) { seen.add(key); entities.push(entity) }
  }

  // Single capitalized words that aren't at sentence start and aren't stop words
  const words = query.split(/\s+/)
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!
    if (/^[A-Z][a-z]{2,}$/.test(word) && !STOP_WORDS.has(word.toLowerCase()) && !seen.has(word.toLowerCase())) {
      seen.add(word.toLowerCase())
      entities.push(word)
    }
  }

  return entities
}

function detectMultiHop(query: string): boolean {
  const lower = query.toLowerCase()
  return /\b(since (?:the|we|i) \w+|after (?:the|we|i) \w+|before (?:the|we|i) \w+|related to (?:the )?\w+|based on (?:the )?\w+|what changed (?:since|after|before)|how did .+ affect|compared to (?:the )?\w+)\b/.test(lower)
}

export function analyzeQueryCore(query: string, options?: { referenceDate?: string | null }): QueryAnalysisCore {
  const normalizedQuery = query.trim().replace(/\s+/g, " ")
  const lower = normalizedQuery.toLowerCase()
  const historicalAt = extractHistoricalAt(normalizedQuery, options?.referenceDate)

  const asksCurrent = /\b(now|current|currently|latest|today|most recent)\b/.test(lower)
  const asksHistorical = /\b(previously|earlier|before|historical|used to|as of|back in|at the time|previous)\b/.test(lower) || Boolean(historicalAt)
  const asksCountOrTotal = /\b(how many|how much|total|combined|in total|altogether|sum)\b/.test(lower)
  const asksOrder = /\b(first|earlier|earliest|before|after|latest|most recent)\b/.test(lower)
  const asksDuration = /\b(how long|how many days|how many weeks|how many months|elapsed|passed)\b/.test(lower)
  const asksPreference = /\b(recommend|suggest|tips?|advice|should i|what should i)\b/.test(lower)

  const stateIntent: QueryStateIntent = asksHistorical
    ? "historical"
    : asksCurrent
      ? "current"
      : "general"

  let reasoningMode: QueryReasoningMode = "simple_fact"
  if (asksPreference) {
    reasoningMode = "preference"
  } else if (asksDuration) {
    reasoningMode = "temporal_arithmetic"
  } else if (asksCountOrTotal) {
    reasoningMode = "aggregation"
  } else if (asksOrder) {
    reasoningMode = "temporal_compare"
  } else if (stateIntent === "current") {
    reasoningMode = "current_state"
  } else if (stateIntent === "historical") {
    reasoningMode = "historical_state"
  }

  return {
    normalizedQuery,
    stateIntent,
    reasoningMode,
    historicalAt,
    dateRange: historicalAt ? { to: historicalAt } : undefined,
    asksCountOrTotal,
    asksOrder,
    asksDuration,
    extractedEntities: extractEntities(normalizedQuery),
    isMultiHop: detectMultiHop(lower),
  }
}
