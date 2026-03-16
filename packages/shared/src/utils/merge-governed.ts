import { normalizeText } from "./text"

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

  return topicOverlapScore(left, right) >= 0.6
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
