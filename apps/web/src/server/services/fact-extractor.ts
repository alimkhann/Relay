/**
 * Deterministic atomic fact decomposition — Mem0-inspired.
 *
 * Takes a digest bullet ("use Postgres for prod; mongo for analytics sandbox")
 * and breaks it into individually-embeddable atomic facts so the reconciler
 * and hybrid search can match, supersede, and rank each fact independently.
 *
 * Zero LLM calls — sentence-level splitting keyed on strong punctuation
 * (`.`, `;`, ` — `, ` and then `, ` additionally`) with a minimum word
 * threshold so short phrases stay intact.
 *
 * If the input is a single atomic fact (no split points, or each candidate
 * falls below the word threshold) the function returns `[trimmed(input)]`.
 */

const MIN_WORDS_PER_FACT = 4
const MAX_FACTS_PER_BULLET = 6

const SPLIT_PATTERN = /(?:\.\s+(?=[A-Z])|;\s+|\s+—\s+|\s+-\s+(?=[A-Z])|(?:^|\s)(?:and then|also|additionally|furthermore|moreover|in addition),?\s+)/i

function normalize(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim()
    .replace(/\.+$/, "")
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function extractAtomicFacts(input: string): string[] {
  const trimmed = input.trim()
  if (!trimmed) return []

  const parts = trimmed
    .split(SPLIT_PATTERN)
    .map((p) => normalize(p))
    .filter((p) => p.length > 0)

  if (parts.length <= 1) return [normalize(trimmed)]

  const accepted: string[] = []
  for (const part of parts) {
    if (wordCount(part) >= MIN_WORDS_PER_FACT) {
      accepted.push(part)
      if (accepted.length >= MAX_FACTS_PER_BULLET) break
    }
  }

  if (accepted.length === 0) return [normalize(trimmed)]

  const seen = new Set<string>()
  const unique: string[] = []
  for (const fact of accepted) {
    const key = fact.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(fact)
  }

  return unique
}

export function decomposeBulletWithTraceability(
  bullet: string,
): { parent: string; atoms: string[] } {
  const atoms = extractAtomicFacts(bullet)
  return {
    parent: normalize(bullet),
    atoms: atoms.length > 1 ? atoms : [],
  }
}
