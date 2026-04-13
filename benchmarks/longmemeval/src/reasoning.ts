import type { QueryReasoningMode } from "@relay/shared"
import { compareTemporalOrder, computeElapsedDays, computeElapsedWeeks, extractTemporalPoints } from "@relay/shared"

import type { BenchmarkQueryAnalysis } from "./query"
import type { RetrievedChunk } from "./retrieve"

export interface BenchmarkTypedFact {
  valueText: string
  numericValue: number | null
  when: string | null
}

export interface BenchmarkEvidenceRow {
  index: number
  when: string | null
  source: RetrievedChunk["matchType"]
  sessionId: string | null
  content: string
  typedFact: BenchmarkTypedFact | null
}

export interface BenchmarkTemporalHint {
  earliest: BenchmarkEvidenceRow | null
  latest: BenchmarkEvidenceRow | null
  elapsedDays: number | null
  elapsedWeeks: number | null
  order: "before" | "after" | "same" | "unknown"
}

export interface BenchmarkUpdateHint {
  current: BenchmarkEvidenceRow | null
  previous: BenchmarkEvidenceRow | null
  changedAt: string | null
}

function extractNumericValue(text: string): number | null {
  const money = text.match(/\$\s?(\d+(?:,\d{3})*(?:\.\d+)?)/)
  if (money?.[1]) return Number(money[1].replace(/,/g, ""))
  const plain = text.match(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\b/)
  return plain?.[1] ? Number(plain[1].replace(/,/g, "")) : null
}

function toTypedFact(content: string, when: string | null, referenceDate?: string | null): BenchmarkTypedFact | null {
  if (!content.trim()) return null
  const temporalPoint = extractTemporalPoints(content, referenceDate)[0]
  return {
    valueText: content,
    numericValue: extractNumericValue(content),
    when: temporalPoint?.isoDate ?? when,
  }
}

export function buildBenchmarkEvidenceTable(input: {
  analysis: BenchmarkQueryAnalysis
  chunks: RetrievedChunk[]
  referenceDate?: string | null
}): BenchmarkEvidenceRow[] {
  const limit = input.analysis.reasoningMode === "aggregation" ? 12 : 8
  return input.chunks.slice(0, limit).map((chunk, index) => ({
    index: index + 1,
    when: chunk.capturedAt ?? chunk.session_date ?? null,
    source: chunk.matchType,
    sessionId: chunk.session_id ?? null,
    content: chunk.content,
    typedFact: toTypedFact(chunk.content, chunk.capturedAt ?? chunk.session_date ?? null, input.referenceDate),
  }))
}

export function buildBenchmarkTemporalHint(rows: BenchmarkEvidenceRow[]): BenchmarkTemporalHint {
  const withTime = rows.filter((row) => row.typedFact?.when).sort((left, right) => Date.parse(left.typedFact?.when ?? "") - Date.parse(right.typedFact?.when ?? ""))
  const earliest = withTime[0] ?? null
  const latest = withTime.at(-1) ?? null
  const earliestWhen = earliest?.typedFact?.when ?? null
  const latestWhen = latest?.typedFact?.when ?? null
  return {
    earliest,
    latest,
    elapsedDays: computeElapsedDays(earliestWhen, latestWhen),
    elapsedWeeks: computeElapsedWeeks(earliestWhen, latestWhen),
    order: compareTemporalOrder(earliestWhen, latestWhen),
  }
}

export function buildBenchmarkUpdateHint(rows: BenchmarkEvidenceRow[]): BenchmarkUpdateHint {
  const current = rows.find((row) => row.source === "canon" && row.content.includes("current")) ?? rows[0] ?? null
  const previous = rows.find((row) => row.source === "canon" && row.content.includes("previous")) ?? rows[1] ?? null
  return {
    current,
    previous,
    changedAt: current?.typedFact?.when ?? current?.when ?? null,
  }
}

export function renderBenchmarkEvidenceTable(rows: BenchmarkEvidenceRow[]): string {
  return rows
    .map((row) => {
      const when = row.when ? ` | ${row.when.slice(0, 10)}` : ""
      const session = row.sessionId ? ` | ${row.sessionId}` : ""
      const value = row.typedFact?.numericValue !== null && row.typedFact?.numericValue !== undefined ? ` | value=${row.typedFact.numericValue}` : ""
      return `${row.index}. [${row.source}]${when}${session}${value} :: ${row.content}`
    })
    .join("\n")
}

export function chooseRetrievalBudget(mode: QueryReasoningMode): { memoryLimit: number; finalTopK: number } {
  if (mode === "aggregation") {
    return { memoryLimit: 44, finalTopK: 24 }
  }
  if (mode === "temporal_arithmetic" || mode === "temporal_compare") {
    return { memoryLimit: 36, finalTopK: 24 }
  }
  if (mode === "current_state" || mode === "historical_state") {
    return { memoryLimit: 30, finalTopK: 20 }
  }
  return { memoryLimit: 20, finalTopK: 20 }
}

export function diversifyChunksForCoverage(chunks: RetrievedChunk[], finalTopK: number): RetrievedChunk[] {
  const chosen: RetrievedChunk[] = []
  const seenSessions = new Set<string>()

  for (const chunk of chunks) {
    if (chosen.length >= finalTopK) break
    if (chunk.session_id && !seenSessions.has(chunk.session_id)) {
      seenSessions.add(chunk.session_id)
      chosen.push(chunk)
    }
  }

  for (const chunk of chunks) {
    if (chosen.length >= finalTopK) break
    if (!chosen.includes(chunk)) chosen.push(chunk)
  }

  return chosen
}
