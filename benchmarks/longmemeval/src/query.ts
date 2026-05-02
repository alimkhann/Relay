import type { QueryReasoningMode, QueryStateIntent } from "@relay/shared"
import { analyzeQueryCore } from "@relay/shared"

export interface BenchmarkQueryAnalysis {
  normalizedQuery: string
  stateIntent: QueryStateIntent
  reasoningMode: QueryReasoningMode
  historicalAt: string | null
  dateRange: { from?: string | null; to?: string | null } | undefined
  asksCountOrTotal: boolean
  asksOrder: boolean
  asksDuration: boolean
}

export function analyzeBenchmarkQuery(query: string, options?: { referenceDate?: string | null }): BenchmarkQueryAnalysis {
  return analyzeQueryCore(query, options)
}
