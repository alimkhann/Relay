import type { CanonEntryRow, MemoryItemRow } from "@relay/shared"
import { compareTemporalOrder, computeElapsedDays, computeElapsedWeeks, extractTemporalPoints } from "@relay/shared"

import type { QueryDecomposition } from "./query-decomposition-service"

export interface TypedEvidenceFact {
  source: "canon" | "memory"
  sourceId: string
  kind: string
  when: string | null
  entity: string | null
  attribute: string | null
  valueText: string
  numericValue: number | null
  isCurrent: boolean
}

export interface ReasoningEvidenceRow {
  source: "canon" | "memory"
  sourceId: string
  kind: string
  when: string | null
  content: string
  typedFact: TypedEvidenceFact | null
}

export interface CurrentPreviousHint {
  current: CanonEntryRow | null
  previous: CanonEntryRow | null
  changedAt: string | null
}

export interface TemporalResolutionHint {
  earliest: ReasoningEvidenceRow | null
  latest: ReasoningEvidenceRow | null
  elapsedDays: number | null
  elapsedWeeks: number | null
  order: "before" | "after" | "same" | "unknown"
}

function sortByTimeDescending<T extends { validFrom?: string | null; updatedAt?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftTime = Date.parse(left.validFrom ?? left.updatedAt ?? "1970-01-01T00:00:00.000Z")
    const rightTime = Date.parse(right.validFrom ?? right.updatedAt ?? "1970-01-01T00:00:00.000Z")
    return rightTime - leftTime
  })
}

function canonStatusWeight(status: CanonEntryRow["status"]): number {
  switch (status) {
    case "active":
      return 3
    case "tentative":
      return 2
    case "superseded":
      return 1
    default:
      return 0
  }
}

function extractNumericValue(text: string): number | null {
  const money = text.match(/\$\s?(\d+(?:,\d{3})*(?:\.\d+)?)/)
  if (money?.[1]) return Number(money[1].replace(/,/g, ""))
  const plain = text.match(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\b/)
  return plain?.[1] ? Number(plain[1].replace(/,/g, "")) : null
}

function extractTypedEvidenceFact(input: {
  source: "canon" | "memory"
  sourceId: string
  kind: string
  when: string | null
  content: string
  isCurrent: boolean
  referenceDate?: string | null
}): TypedEvidenceFact | null {
  const normalized = input.content.trim()
  if (!normalized) return null
  const numericValue = extractNumericValue(normalized)
  const temporalPoint = extractTemporalPoints(normalized, input.referenceDate)[0]
  const match = normalized.match(/^(?:\[[^\]]+\]\s*)?([^:]+?):\s*(.+)$/)
  const attribute = match?.[1]?.trim() ?? null
  const valueText = match?.[2]?.trim() ?? normalized

  return {
    source: input.source,
    sourceId: input.sourceId,
    kind: input.kind,
    when: temporalPoint?.isoDate ?? input.when,
    entity: null,
    attribute,
    valueText,
    numericValue,
    isCurrent: input.isCurrent,
  }
}

export function buildCurrentPreviousHint(canonRows: CanonEntryRow[]): CurrentPreviousHint {
  const sorted = [...canonRows].sort((left, right) => {
    const byStatus = canonStatusWeight(right.status) - canonStatusWeight(left.status)
    if (byStatus !== 0) return byStatus
    const leftTime = Date.parse(left.validFrom ?? left.updatedAt ?? "1970-01-01T00:00:00.000Z")
    const rightTime = Date.parse(right.validFrom ?? right.updatedAt ?? "1970-01-01T00:00:00.000Z")
    return rightTime - leftTime
  })
  return {
    current: sorted[0] ?? null,
    previous: sorted[1] ?? null,
    changedAt: sorted[0]?.validFrom ?? sorted[0]?.updatedAt ?? null,
  }
}

export function buildTemporalResolutionHint(rows: ReasoningEvidenceRow[]): TemporalResolutionHint {
  const withTime = rows.filter((row) => row.when).sort((left, right) => Date.parse(left.when ?? "") - Date.parse(right.when ?? ""))
  const earliest = withTime[0] ?? null
  const latest = withTime.at(-1) ?? null
  return {
    earliest,
    latest,
    elapsedDays: earliest && latest ? computeElapsedDays(earliest.when, latest.when) : null,
    elapsedWeeks: earliest && latest ? computeElapsedWeeks(earliest.when, latest.when) : null,
    order: earliest && latest ? compareTemporalOrder(earliest.when, latest.when) : "unknown",
  }
}

export function buildReasoningEvidenceTable(input: {
  query: QueryDecomposition
  canonResults: CanonEntryRow[]
  memoryResults: MemoryItemRow[]
  referenceDate?: string | null
}): ReasoningEvidenceRow[] {
  const currentPrevious = buildCurrentPreviousHint(input.canonResults)
  const canonRows: ReasoningEvidenceRow[] = input.canonResults.slice(0, 8).map((row) => ({
    source: "canon",
    sourceId: row.id,
    kind: row.kind,
    when: row.validFrom ?? row.updatedAt,
    content: row.content,
    typedFact: extractTypedEvidenceFact({
      source: "canon",
      sourceId: row.id,
      kind: row.kind,
      when: row.validFrom ?? row.updatedAt,
      content: row.content,
      isCurrent: currentPrevious.current?.id === row.id,
      referenceDate: input.referenceDate,
    }),
  }))

  const memoryRows: ReasoningEvidenceRow[] = input.memoryResults.slice(0, input.query.reasoningMode === "aggregation" ? 12 : 8).map((row) => ({
    source: "memory",
    sourceId: row.id,
    kind: row.type,
    when: row.capturedAt ?? row.updatedAt,
    content: row.content,
    typedFact: extractTypedEvidenceFact({
      source: "memory",
      sourceId: row.id,
      kind: row.type,
      when: row.capturedAt ?? row.updatedAt,
      content: row.content,
      isCurrent: false,
      referenceDate: input.referenceDate,
    }),
  }))

  return [...canonRows, ...memoryRows].sort((left, right) => {
    const leftTime = Date.parse(left.when ?? "1970-01-01T00:00:00.000Z")
    const rightTime = Date.parse(right.when ?? "1970-01-01T00:00:00.000Z")
    return rightTime - leftTime
  })
}
