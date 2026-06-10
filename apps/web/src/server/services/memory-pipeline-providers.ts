/**
 * Memory-pipeline providers — Gemini-backed entity + observation extractors
 * plus an in-process daily USD budget gate.
 *
 * Wiring: the cron route (`/api/cron/memory-pipeline`) builds these only when
 * `RELAY_MEMORY_PIPELINE_FULL=true`. Until that env is set, the worker runs
 * embed-only and these providers are inert.
 *
 * Budget gate: keyed by UTC day, module-scoped counter. On Vercel cold start
 * the counter resets — worst case is ~one extra tick of extraction (≈$0.05)
 * over the cap per process restart, which is well within the safety margin
 * for a circuit-breaker (not a usage ration).
 */

import type {
  EnrichmentContext,
  ExtractedEntity,
  ExtractedObservation,
  PipelineProviders,
} from "@relay/memory-pipeline"

import { runGeminiJsonWithFallback } from "./gemini-service"

const EXTRACTION_MODEL_PRIMARY =
  process.env.GEMINI_MODEL_EXTRACTION_PRIMARY ?? "gemini-3.1-flash-lite"
const EXTRACTION_MODEL_FALLBACK =
  process.env.GEMINI_MODEL_EXTRACTION_FALLBACK ?? "gemini-2.5-flash-lite"

const ENTITY_MAX_INPUT = 4_000
const ENTITY_MAX_OUTPUT = 500
const OBSERVATION_MAX_INPUT = 4_000
const OBSERVATION_MAX_OUTPUT = 800

// Conservative per-call USD estimates for Flash-Lite. Real cost typically
// lower (~$0.0003-$0.001 per ≈1-2k token in/out). Used purely as a
// circuit-breaker against runaway loops or pricing surprises.
const ENTITY_EXTRACT_USD = 0.001
const OBSERVATION_EXTRACT_USD = 0.0015

const DEFAULT_DAILY_USD_CAP = 5

export interface PipelineBudgetGate {
  /** Returns true when the next call is within the daily cap. */
  shouldRun(estimatedUsd: number): boolean
  /** Record that an actual call landed. */
  record(usd: number): void
  /** Current spend snapshot — used in tests + diagnostics. */
  snapshot(): { capUsd: number; spentUsd: number; resetAt: Date }
}

export function buildPipelineBudgetGate(opts?: { capUsdOverride?: number }): PipelineBudgetGate {
  const capUsd =
    opts?.capUsdOverride ??
    Number.parseFloat(process.env.RELAY_PIPELINE_DAILY_USD_CAP ?? String(DEFAULT_DAILY_USD_CAP))
  let day = startOfUtcDay(new Date())
  let spentUsd = 0

  return {
    shouldRun(estimatedUsd: number) {
      const now = new Date()
      const today = startOfUtcDay(now)
      if (today.getTime() !== day.getTime()) {
        day = today
        spentUsd = 0
      }
      return spentUsd + estimatedUsd <= capUsd
    },
    record(usd: number) {
      spentUsd += usd
    },
    snapshot() {
      return { capUsd, spentUsd, resetAt: addDays(day, 1) }
    },
  }
}

interface EntityModel {
  entities?: Array<{ name?: string; kind?: string; mention?: string }>
}

export function buildEntityExtractor(
  gate: PipelineBudgetGate,
): NonNullable<PipelineProviders["extractEntities"]> {
  return async (ctx: EnrichmentContext): Promise<ExtractedEntity[]> => {
    if (!gate.shouldRun(ENTITY_EXTRACT_USD)) return []
    try {
      const result = await runGeminiJsonWithFallback<EntityModel>({
        primaryModel: EXTRACTION_MODEL_PRIMARY,
        fallbackModel: EXTRACTION_MODEL_FALLBACK,
        maxInputTokens: ENTITY_MAX_INPUT,
        maxOutputTokens: ENTITY_MAX_OUTPUT,
        systemInstruction: [
          "Extract concrete named entities from the memory item text.",
          'Return JSON exactly in this shape: {"entities":[{"name":"...","kind":"...","mention":"..."}]}',
          "kind in {person, organization, product, technology, location, project, concept}.",
          'name = canonical form (e.g. "PostgreSQL" not "postgres").',
          "mention = exact substring as it appears in the text.",
          "Return at most 10 entities. Skip pronouns, generic words, the first-person speaker.",
        ].join(" "),
        prompt: ctx.content,
      })
      gate.record(ENTITY_EXTRACT_USD)
      return (result.data.entities ?? [])
        .filter((e): e is { name: string; kind?: string; mention?: string } =>
          Boolean(e.name && e.name.trim().length > 0),
        )
        .slice(0, 10)
        .map((e) => ({
          name: e.name.trim(),
          ...(e.kind?.trim() ? { kind: e.kind.trim() } : {}),
          mentionText: (e.mention ?? e.name).trim(),
        }))
    } catch (error) {
      console.error(
        "[memory-pipeline] entity extractor failed:",
        error instanceof Error ? error.message : error,
      )
      return []
    }
  }
}

interface ObservationModel {
  observations?: Array<{
    content?: string
    confidence?: number
    subject?: string
    predicate?: string
    object?: string
    objectLiteral?: string
  }>
}

export function buildObservationExtractor(
  gate: PipelineBudgetGate,
): NonNullable<PipelineProviders["extractObservations"]> {
  return async (ctx: EnrichmentContext): Promise<ExtractedObservation[]> => {
    if (!gate.shouldRun(OBSERVATION_EXTRACT_USD)) return []
    try {
      const result = await runGeminiJsonWithFallback<ObservationModel>({
        primaryModel: EXTRACTION_MODEL_PRIMARY,
        fallbackModel: EXTRACTION_MODEL_FALLBACK,
        maxInputTokens: OBSERVATION_MAX_INPUT,
        maxOutputTokens: OBSERVATION_MAX_OUTPUT,
        systemInstruction: [
          "Extract durable observations (factual statements) from the memory item.",
          'Return JSON exactly in this shape: {"observations":[{"content":"...","confidence":0.0-1.0,"subject":"...","predicate":"...","object":"...","objectLiteral":"..."}]}',
          "content = the standalone observation sentence (one fact per row).",
          "confidence = 0.0-1.0 based on how directly the source text states the fact.",
          "When the observation is a clear Subject-Verb-Object triple between two entities, populate subject + predicate + object (entity canonical names matching the entity extractor output).",
          "Use objectLiteral instead of object when the object is a value or literal rather than a named entity.",
          "Skip ephemeral things (UI state, transient questions, in-flight tasks). Prefer durable facts (decisions, preferences, configurations, relationships, constraints).",
          "Return at most 8 observations.",
        ].join(" "),
        prompt: ctx.content,
      })
      gate.record(OBSERVATION_EXTRACT_USD)
      return (result.data.observations ?? [])
        .filter((o): o is { content: string } & Record<string, unknown> =>
          Boolean(o.content && typeof o.content === "string" && o.content.trim().length > 0),
        )
        .slice(0, 8)
        .map((o) => {
          const out: ExtractedObservation = {
            content: String(o.content).trim(),
          }
          if (typeof o.confidence === "number") {
            out.confidence = Math.max(0, Math.min(1, o.confidence))
          }
          const subject = typeof o.subject === "string" ? o.subject.trim() : ""
          const predicate = typeof o.predicate === "string" ? o.predicate.trim() : ""
          const object = typeof o.object === "string" ? o.object.trim() : ""
          const objectLiteral = typeof o.objectLiteral === "string" ? o.objectLiteral.trim() : ""
          if (subject) out.subjectName = subject
          if (predicate) out.predicate = predicate
          if (object) out.objectName = object
          if (objectLiteral) out.objectLiteral = objectLiteral
          return out
        })
    } catch (error) {
      console.error(
        "[memory-pipeline] observation extractor failed:",
        error instanceof Error ? error.message : error,
      )
      return []
    }
  }
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}
