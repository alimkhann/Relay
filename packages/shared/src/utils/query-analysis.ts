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
}

function extractHistoricalAt(query: string, referenceDate?: string | null): string | null {
  return resolvePrimaryTemporalPoint(query, referenceDate)?.isoDate ?? null
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
  }
}
