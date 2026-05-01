import type { MemoryItemRow } from "@relay/shared"

import { GEMINI_MODELS, runGeminiJsonWithFallback } from "./gemini-service"

const RERANK_SCORE_THRESHOLD = 0.85
const RERANK_GAP_THRESHOLD = 0.15
const MAX_CANDIDATES = 30

interface RerankCandidate {
  item: MemoryItemRow
  originalScore: number
}

interface RerankResult {
  items: MemoryItemRow[]
  reranked: boolean
}

function shouldRerank(candidates: RerankCandidate[]): boolean {
  if (candidates.length < 2) return false
  const top = candidates[0]!.originalScore
  if (top >= RERANK_SCORE_THRESHOLD) return false
  const gap = top - candidates[1]!.originalScore
  return gap < RERANK_GAP_THRESHOLD
}

export async function conditionalRerank(
  query: string,
  candidates: RerankCandidate[],
  options?: { signal?: AbortSignal },
): Promise<RerankResult> {
  if (!shouldRerank(candidates)) {
    return { items: candidates.map((c) => c.item), reranked: false }
  }

  const top = candidates.slice(0, MAX_CANDIDATES)
  const prompt = buildRerankPrompt(query, top)

  try {
    const result = await runGeminiJsonWithFallback<{ rankings: number[] }>({
      primaryModel: GEMINI_MODELS.adjudication.primary,
      fallbackModel: GEMINI_MODELS.adjudication.fallback,
      systemInstruction: "You are a search result relevance scorer. Given a query and candidate results, return a JSON object with a 'rankings' array of indices sorted by relevance (most relevant first). Only include indices of results that are relevant to the query.",
      prompt,
      maxInputTokens: GEMINI_MODELS.adjudication.maxInputTokens,
      maxOutputTokens: GEMINI_MODELS.adjudication.maxOutputTokens,
      signal: options?.signal,
    })

    const rankings = result.data.rankings
    if (!Array.isArray(rankings) || rankings.length === 0) {
      return { items: candidates.map((c) => c.item), reranked: false }
    }

    const reranked: MemoryItemRow[] = []
    const seen = new Set<number>()

    for (const idx of rankings) {
      if (typeof idx === "number" && idx >= 0 && idx < top.length && !seen.has(idx)) {
        seen.add(idx)
        reranked.push(top[idx]!.item)
      }
    }

    for (let i = 0; i < top.length; i++) {
      if (!seen.has(i)) reranked.push(top[i]!.item)
    }

    for (let i = MAX_CANDIDATES; i < candidates.length; i++) {
      reranked.push(candidates[i]!.item)
    }

    return { items: reranked, reranked: true }
  } catch {
    return { items: candidates.map((c) => c.item), reranked: false }
  }
}

function buildRerankPrompt(query: string, candidates: RerankCandidate[]): string {
  const parts = [`Query: "${query}"\n\nCandidate results:`]
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!
    const title = c.item.title ? `${c.item.title}: ` : ""
    const content = c.item.content.slice(0, 200)
    parts.push(`[${i}] ${title}${content}`)
  }
  parts.push("\nReturn JSON: { \"rankings\": [indices sorted by relevance] }")
  return parts.join("\n")
}
