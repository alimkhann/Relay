export type TemporalPrecision = "day" | "week" | "month" | "year" | "unknown"

export interface TemporalPoint {
  sourceText: string
  isoDate: string | null
  precision: TemporalPrecision
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function shiftUtcDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime())
  copy.setUTCDate(copy.getUTCDate() + days)
  return startOfUtcDay(copy)
}

function shiftUtcMonths(date: Date, months: number): Date {
  return startOfUtcDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)))
}

function toIso(date: Date): string {
  return startOfUtcDay(date).toISOString()
}

function normalizeReferenceDate(referenceDate?: string | null): Date {
  const parsed = referenceDate ? new Date(referenceDate) : new Date()
  return Number.isNaN(parsed.getTime()) ? startOfUtcDay(new Date()) : startOfUtcDay(parsed)
}

function parseExplicitDate(text: string): TemporalPoint[] {
  const results: TemporalPoint[] = []
  const isoMatches = text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)
  for (const match of isoMatches) {
    results.push({ sourceText: match[1]!, isoDate: `${match[1]}T00:00:00.000Z`, precision: "day" })
  }

  const monthDayYearMatches = text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,\s*(20\d{2}))?\b/gi)
  for (const match of monthDayYearMatches) {
    const year = match[3] ?? String(new Date().getUTCFullYear())
    const date = new Date(`${match[1]} ${match[2]}, ${year} 00:00:00 UTC`)
    if (!Number.isNaN(date.getTime())) {
      results.push({ sourceText: match[0]!, isoDate: toIso(date), precision: "day" })
    }
  }

  return results
}

function parseRelativeDate(text: string, referenceDate?: string | null): TemporalPoint[] {
  const results: TemporalPoint[] = []
  const ref = normalizeReferenceDate(referenceDate)
  const lower = text.toLowerCase()

  const agoMatches = lower.matchAll(/\b(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+ago\b/g)
  for (const match of agoMatches) {
    const amount = Number(match[1])
    const unit = match[2]
    if (!unit) continue
    let resolved: Date = ref
    let precision: TemporalPrecision = "unknown"
    if (unit.startsWith("day")) {
      resolved = shiftUtcDays(ref, -amount)
      precision = "day"
    } else if (unit.startsWith("week")) {
      resolved = shiftUtcDays(ref, -(amount * 7))
      precision = "week"
    } else if (unit.startsWith("month")) {
      resolved = shiftUtcMonths(ref, -amount)
      precision = "month"
    } else if (unit.startsWith("year")) {
      resolved = startOfUtcDay(new Date(Date.UTC(ref.getUTCFullYear() - amount, 0, 1)))
      precision = "year"
    }
    results.push({ sourceText: match[0]!, isoDate: toIso(resolved), precision })
  }

  if (lower.includes("yesterday")) {
    results.push({ sourceText: "yesterday", isoDate: toIso(shiftUtcDays(ref, -1)), precision: "day" })
  }
  if (lower.includes("today")) {
    results.push({ sourceText: "today", isoDate: toIso(ref), precision: "day" })
  }
  if (lower.includes("last week")) {
    results.push({ sourceText: "last week", isoDate: toIso(shiftUtcDays(ref, -7)), precision: "week" })
  }
  if (lower.includes("last month")) {
    results.push({ sourceText: "last month", isoDate: toIso(shiftUtcMonths(ref, -1)), precision: "month" })
  }
  if (lower.includes("last year")) {
    results.push({ sourceText: "last year", isoDate: toIso(new Date(Date.UTC(ref.getUTCFullYear() - 1, 0, 1))), precision: "year" })
  }

  return results
}

export function extractTemporalPoints(text: string, referenceDate?: string | null): TemporalPoint[] {
  const explicit = parseExplicitDate(text)
  const relative = parseRelativeDate(text, referenceDate)
  const seen = new Set<string>()
  return [...explicit, ...relative].filter((point) => {
    const key = `${point.isoDate}:${point.sourceText}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function resolvePrimaryTemporalPoint(text: string, referenceDate?: string | null): TemporalPoint | null {
  return extractTemporalPoints(text, referenceDate)[0] ?? null
}

export function compareTemporalOrder(left: string | null, right: string | null): "before" | "after" | "same" | "unknown" {
  if (!left || !right) return "unknown"
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return "unknown"
  if (leftTime < rightTime) return "before"
  if (leftTime > rightTime) return "after"
  return "same"
}

export function computeElapsedDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const fromTime = Date.parse(from)
  const toTime = Date.parse(to)
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return null
  return Math.round((toTime - fromTime) / 86_400_000)
}

export function computeElapsedWeeks(from: string | null, to: string | null): number | null {
  const days = computeElapsedDays(from, to)
  return days === null ? null : Number((days / 7).toFixed(2))
}
