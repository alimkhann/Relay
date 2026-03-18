import { normalizeText } from "./text"

/**
 * Configurable thresholds for topic dedup.
 *
 * TOPIC_MATCH_THRESHOLD (0.85): Fast-path — items above this score are
 * considered the same topic and merged deterministically.
 *
 * TOPIC_GREY_ZONE_MIN (0.6): Items scoring between 0.6 and 0.85 are
 * "likely" the same topic. In a future phase an LLM pass will resolve
 * these. For now they are treated as distinct (conservative — avoids
 * false-positive merges that lose user data).
 */
export const TOPIC_MATCH_THRESHOLD = 0.85
export const TOPIC_GREY_ZONE_MIN = 0.6

export const COMMON_TOPIC_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "have",
  "has",
  "after",
  "before",
  "make",
  "keep",
  "using",
  "use",
  "build",
  "relay",
  "project",
  "chat",
  "work",
])

export function tokenizeComparable(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.replace(/(ing|ed|ly|es|s)$/i, ""))
    .filter((token) => token.length > 2 && !COMMON_TOPIC_STOP_WORDS.has(token))
}

export function topicOverlapScore(left: string, right: string) {
  const leftTokens = tokenizeComparable(left)
  const rightTokens = tokenizeComparable(right)

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0
  }

  const rightSet = new Set(rightTokens)
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length
  return overlap / Math.max(Math.min(leftTokens.length, rightTokens.length), 1)
}

export function isSameTopic(left: string, right: string) {
  const normalizedLeft = normalizeText(left).toLowerCase()
  const normalizedRight = normalizeText(right).toLowerCase()

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return true
  }

  return topicOverlapScore(left, right) >= TOPIC_MATCH_THRESHOLD
}

/**
 * Returns true when two items fall in the "grey zone" — similar enough
 * that they might be the same topic, but below the deterministic match
 * threshold. A future LLM pass will resolve these; for now callers can
 * use this to flag items for review.
 */
export function isLikelySameTopic(left: string, right: string) {
  if (isSameTopic(left, right)) return false
  const score = topicOverlapScore(left, right)
  return score >= TOPIC_GREY_ZONE_MIN && score < TOPIC_MATCH_THRESHOLD
}

export function hasReplacementSignal(value: string) {
  return /\b(replace|replaced|instead of|rather than|switch to|migrate to|use .* instead|no longer|deprecated|supersed)\b/i.test(
    value
  )
}

export function hasNegationSignal(value: string) {
  return /\b(do not|don't|dont|avoid|never|must not|cannot|can't|can not|no longer|without)\b/i.test(
    value
  )
}

export function hasCompletionSignal(value: string) {
  return /\b(completed|finished|shipped|deployed|resolved|fixed|implemented|merged|done|launched)\b/i.test(
    value
  )
}

/**
 * Represents a memory item with provenance for conflict resolution.
 */
export interface MemoryItemForConflictResolution {
  id: string
  content: string
  capturedAt: string | null
  type: string
}

/**
 * Recency-based conflict resolution for memory items.
 * When two items cover the same topic, the one with the more recent
 * `capturedAt` timestamp wins. Items without `capturedAt` are treated
 * as older than items with a timestamp.
 *
 * @returns The winning item between two conflicting items, or null if they don't conflict.
 */
export function resolveMemoryConflict(
  existing: MemoryItemForConflictResolution,
  incoming: MemoryItemForConflictResolution
): MemoryItemForConflictResolution | null {
  // Only resolve conflicts between same-type items covering the same topic
  if (existing.type !== incoming.type) return null
  if (!isSameTopic(existing.content, incoming.content)) return null

  // Recency-based resolution: newest captured_at wins
  const existingTime = existing.capturedAt ? new Date(existing.capturedAt).getTime() : 0
  const incomingTime = incoming.capturedAt ? new Date(incoming.capturedAt).getTime() : 0

  return incomingTime >= existingTime ? incoming : existing
}

/**
 * Deduplicate memory items based on topic similarity and recency.
 * Items covering the same topic are merged, with the most recently
 * captured item winning.
 *
 * @returns Array of unique items after conflict resolution
 */
export function deduplicateMemoryItems<T extends MemoryItemForConflictResolution>(
  items: T[]
): T[] {
  const result: T[] = []

  for (const item of items) {
    const conflictIndex = result.findIndex(
      (existing) =>
        existing.type === item.type && isSameTopic(existing.content, item.content)
    )

    if (conflictIndex >= 0) {
      // Conflict found — resolve by recency
      const existingItem = result[conflictIndex]
      if (existingItem) {
        const existingTime = existingItem.capturedAt ? new Date(existingItem.capturedAt).getTime() : 0
        const itemTime = item.capturedAt ? new Date(item.capturedAt).getTime() : 0

        if (itemTime >= existingTime) {
          result[conflictIndex] = item
        }
        // If existing is newer, keep it (do nothing)
      }
    } else {
      result.push(item)
    }
  }

  return result
}

export function mergeGovernedList(
  existing: string[],
  incoming: string[],
  kind: "decision" | "constraint" | "task"
) {
  const next = existing.map((item) => normalizeText(item)).filter(Boolean)

  for (const candidate of incoming.map((item) => normalizeText(item)).filter(Boolean)) {
    const exactIndex = next.findIndex((item) => item.toLowerCase() === candidate.toLowerCase())
    if (exactIndex >= 0) {
      next[exactIndex] = candidate
      continue
    }

    const supersededIndex = next.findIndex((item) => {
      if (!isSameTopic(item, candidate)) {
        return false
      }

      if (kind === "task") {
        return true
      }

      return hasReplacementSignal(candidate) || hasNegationSignal(item) !== hasNegationSignal(candidate)
    })

    if (supersededIndex >= 0) {
      next[supersededIndex] = candidate
      continue
    }

    next.push(candidate)
  }

  return next
}
