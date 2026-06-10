/**
 * Project-relevance classifier for automatic multi-project fan-out.
 *
 * Given a captured transcript and the user's other projects, decide which ones
 * the chat is genuinely relevant to — so a chat that is mostly about project A
 * but also touches project B auto-fans a digest into B (in addition to A). The
 * per-project digest re-filters the transcript (`shouldMerge`), so a thin mention
 * merges little/nothing: a false positive costs a wasted call, not pollution.
 *
 * Best-effort + budget-gated, mirroring `classifyPersonalSalience`. Never throws.
 * Personal is never a candidate here (durable user facts are harvested separately).
 */

import { logServerEvent } from "@/server/logging/logger"
import { buildPipelineBudgetGate, type PipelineBudgetGate } from "./memory-pipeline-providers"
import { runGeminiJsonWithFallback } from "./gemini-service"

const MODEL_PRIMARY =
  process.env.GEMINI_MODEL_EXTRACTION_PRIMARY ?? "gemini-3.1-flash-lite"
const MODEL_FALLBACK =
  process.env.GEMINI_MODEL_EXTRACTION_FALLBACK ?? "gemini-2.5-flash-lite"

const MAX_INPUT = 8_000
const MAX_OUTPUT = 500
const CLASSIFY_USD = 0.0015

/** Keep prompt size + cost bounded regardless of how many projects the user has. */
const MAX_CANDIDATES = 8
const SUMMARY_MAX = 240
/** A chat must clearly touch a project to fan into it — keep this conservative so
 * the extra Gemini digests stay cheap; the per-project `shouldMerge` is the second
 * gate against noise. */
const RELEVANCE_THRESHOLD = 0.6

export interface ProjectRelevanceCandidate {
  id: string
  name: string
  /** Short subject blurb (objective/description) so the model can judge relevance. */
  summary: string
}

interface RelevanceModel {
  relevant?: Array<{ index?: number; confidence?: number }>
}

export interface ProjectRelevanceDeps {
  runJson?: typeof runGeminiJsonWithFallback
  gate?: PipelineBudgetGate
}

let sharedGate: PipelineBudgetGate | null = null
function relevanceGate(): PipelineBudgetGate {
  if (!sharedGate) sharedGate = buildPipelineBudgetGate()
  return sharedGate
}

function buildSystemInstruction(candidates: ProjectRelevanceCandidate[]): string {
  return [
    "You route a captured AI chat to the user's projects. Decide which projects the chat is genuinely about — include a project even if it is only a secondary topic, as long as the chat actually discusses its subject.",
    'Return JSON exactly: {"relevant":[{"index":<number>,"confidence":0.0-1.0}]}',
    "index = the project's number below. confidence = how clearly the chat discusses that project's subject (1.0 = a primary topic, 0.6 = a real but minor mention, <0.5 = barely/not related — omit).",
    "Do NOT include a project just because it is the user's; only include genuine topical relevance. If none apply, return {\"relevant\":[]}.",
    "Projects:",
    ...candidates.map(
      (candidate, index) =>
        `[${index}] ${candidate.name}: ${candidate.summary.slice(0, SUMMARY_MAX) || "(no description)"}`,
    ),
  ].join("\n")
}

/**
 * Returns the project IDs the transcript is relevant to (≥ threshold), from the
 * supplied candidates. Empty on no-relevance, model failure, or budget exhaustion.
 */
export async function classifyProjectRelevance(
  userId: string,
  content: string,
  candidates: ProjectRelevanceCandidate[],
  deps: ProjectRelevanceDeps = {},
): Promise<string[]> {
  const text = content?.trim()
  if (!text || candidates.length === 0) return []

  const limited = candidates.slice(0, MAX_CANDIDATES)
  const gate = deps.gate ?? relevanceGate()
  if (!gate.shouldRun(CLASSIFY_USD)) {
    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "capture",
      event: "project_relevance_budget_skipped",
      message: "Project-relevance classify skipped — budget gate.",
      userId,
    }).catch(() => {})
    return []
  }

  const runJson = deps.runJson ?? runGeminiJsonWithFallback
  try {
    const result = await runJson<RelevanceModel>({
      primaryModel: MODEL_PRIMARY,
      fallbackModel: MODEL_FALLBACK,
      maxInputTokens: MAX_INPUT,
      maxOutputTokens: MAX_OUTPUT,
      systemInstruction: buildSystemInstruction(limited),
      prompt: text,
    })
    gate.record(CLASSIFY_USD)

    const kept: string[] = []
    const dropped: Array<{ index: number; confidence: number }> = []
    for (const row of result.data.relevant ?? []) {
      const index = typeof row.index === "number" ? row.index : -1
      const confidence =
        typeof row.confidence === "number" ? Math.max(0, Math.min(1, row.confidence)) : 0
      const candidate = limited[index]
      if (!candidate) continue
      if (confidence >= RELEVANCE_THRESHOLD) kept.push(candidate.id)
      else dropped.push({ index, confidence })
    }
    const uniqueKept = [...new Set(kept)]

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "capture",
      event: "project_relevance_classified",
      message: "Classified transcript relevance for auto multi-project fan-out.",
      userId,
      context: {
        candidateCount: limited.length,
        keptProjectIds: uniqueKept,
        dropped,
      },
    }).catch(() => {})

    return uniqueKept
  } catch (error) {
    console.warn(
      "[project-relevance] classify failed:",
      error instanceof Error ? error.message : error,
    )
    return []
  }
}
