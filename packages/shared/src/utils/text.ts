export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/**
 * Detects "X -> Y" arrow notation from Gemini digest deltas.
 * Returns the right-hand side if meaningful, null if both sides are empty/None.
 */
export function stripArrowNotation(value: string): string | null {
  const match = value.match(/^(.+?)\s*->\s*(.+)$/)
  if (!match) return value.trim() || null

  const right = match[2]!.trim()
  const isNone = (v: string) => !v || /^none\.?$/i.test(v)

  if (isNone(right)) return null
  return right
}

/**
 * Truncates at the last sentence boundary (`.` or ` `) before maxLen, appends `...`
 */
export function truncateSentence(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value

  const slice = value.slice(0, maxLen)
  const lastPeriod = slice.lastIndexOf(".")
  if (lastPeriod > maxLen * 0.5) {
    return slice.slice(0, lastPeriod + 1)
  }

  const lastSpace = slice.lastIndexOf(" ")
  if (lastSpace > maxLen * 0.3) {
    return slice.slice(0, lastSpace) + "..."
  }

  return slice + "..."
}

/**
 * Escapes leading `#` and unmatched `*`/`_` that break markdown structure.
 */
export function escapeMarkdownInline(value: string): string {
  let result = value.replace(/^(#{1,6})\s/gm, "\\$1 ")

  const asteriskCount = (result.match(/\*/g) || []).length
  if (asteriskCount % 2 !== 0) {
    result = result.replace(/\*/g, "\\*")
  }

  const underscoreCount = (result.match(/_/g) || []).length
  if (underscoreCount % 2 !== 0) {
    result = result.replace(/_/g, "\\_")
  }

  return result
}

export function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
