/**
 * Selective personal-memory service.
 *
 * Personal memory behaves like ChatGPT / mem0: it stores durable, user-centric
 * facts (identity, preferences, what they're building, skills, goals,
 * constraints, relationships, health) — NOT every captured turn, and NOT raw
 * project-technical detail. A salience classifier extracts only lasting facts
 * about the user; a mem0-style ADD/NOOP decision keeps the personal project
 * from accumulating obvious duplicates. Supersession of genuinely-changed facts
 * is left to the memory-pipeline worker, which already runs `resolveMemoryConflict`
 * over every project (personal is just a kind='personal' project).
 *
 * Routing is fire-and-forget and additive: the original capture still lands in
 * the active project. When `routingHint: "auto"` is set on a write to a normal
 * project, this service ALSO derives durable user facts and (during the soak,
 * gated by `RELAY_PERSONAL_MEMORY_AUTOWRITE`) writes the high-confidence ones
 * into the user's personal project. Below-threshold / soak-disabled facts are
 * logged, never written — that gives a tuning dataset before we trust the
 * prompt enough to auto-write.
 */

import {
  resolveMemoryConflict,
  type MemoryItemForConflictResolution,
} from "@relay/shared"

import { createRepositoryBundle } from "@relay/db"

import { logServerEvent } from "@/server/logging/logger"
import { buildPipelineBudgetGate, type PipelineBudgetGate } from "./memory-pipeline-providers"
import { createMemoryItem } from "./memory-service"
import { runGeminiJsonWithFallback } from "./gemini-service"

const CLASSIFY_MODEL_PRIMARY =
  process.env.GEMINI_MODEL_EXTRACTION_PRIMARY ?? "gemini-3.1-flash-lite"
const CLASSIFY_MODEL_FALLBACK =
  process.env.GEMINI_MODEL_EXTRACTION_FALLBACK ?? "gemini-2.5-flash-lite"

const CLASSIFY_MAX_INPUT = 4_000
const CLASSIFY_MAX_OUTPUT = 600
const CLASSIFY_USD = 0.0015

/** Facts at or above this confidence are eligible to write (when autowrite is on). */
export const PERSONAL_SALIENCE_WRITE_THRESHOLD = 0.7

export const PERSONAL_FACT_CATEGORIES = [
  "identity",
  "preference",
  "work",
  "skill",
  "goal",
  "constraint",
  "relationship",
  "health",
] as const

export type PersonalFactCategory = (typeof PERSONAL_FACT_CATEGORIES)[number]

export interface PersonalFact {
  category: PersonalFactCategory
  /** Standalone fact about the user, phrased "User ...". */
  content: string
  confidence: number
}

interface SalienceModel {
  facts?: Array<{
    category?: string
    content?: string
    confidence?: number
  }>
}

const SALIENCE_SYSTEM_INSTRUCTION = [
  "You extract durable, user-centric facts worth remembering long-term about a person, the way ChatGPT or Claude memory does.",
  'Return JSON exactly in this shape: {"facts":[{"category":"...","content":"...","confidence":0.0-1.0}]}',
  `category in {${PERSONAL_FACT_CATEGORIES.join(", ")}}.`,
  'content = one concise standalone fact about the USER, phrased in third person starting with "User " (e.g. "User is vegetarian", "User is building Relay, an AI memory startup").',
  "confidence = 0.0-1.0 for how clearly AND how durably the text states a lasting fact about the user.",
  "ONLY extract lasting personal facts: identity/bio, stable preferences, what they are building or working on, skills, goals, constraints, relationships, health.",
  "REJECT and omit: transient task state, one-off questions, project-technical details (API params, config values, code), general knowledge, and anything not about THIS user as a person.",
  'If nothing durable and user-centric is present, return {"facts":[]}.',
  "Return at most 5 facts.",
].join(" ")

function isPersonalFactCategory(value: string): value is PersonalFactCategory {
  return (PERSONAL_FACT_CATEGORIES as readonly string[]).includes(value)
}

// Module-scoped budget gate — circuit-breaker against runaway classification
// cost, shared across requests in a process (mirrors memory-pipeline-providers).
let sharedGate: PipelineBudgetGate | null = null
function classifyGate(): PipelineBudgetGate {
  if (!sharedGate) sharedGate = buildPipelineBudgetGate()
  return sharedGate
}

export interface ClassifyDeps {
  runJson?: typeof runGeminiJsonWithFallback
  gate?: PipelineBudgetGate
}

/**
 * Classify captured text into durable, user-centric facts. Returns [] for
 * transient, project-technical, or non-personal content. Never throws — on
 * model failure it returns [] so the caller's capture path is unaffected.
 */
export async function classifyPersonalSalience(
  content: string,
  deps: ClassifyDeps = {},
): Promise<PersonalFact[]> {
  const text = content?.trim()
  if (!text) return []

  const gate = deps.gate ?? classifyGate()
  if (!gate.shouldRun(CLASSIFY_USD)) return []

  const runJson = deps.runJson ?? runGeminiJsonWithFallback
  try {
    const result = await runJson<SalienceModel>({
      primaryModel: CLASSIFY_MODEL_PRIMARY,
      fallbackModel: CLASSIFY_MODEL_FALLBACK,
      maxInputTokens: CLASSIFY_MAX_INPUT,
      maxOutputTokens: CLASSIFY_MAX_OUTPUT,
      systemInstruction: SALIENCE_SYSTEM_INSTRUCTION,
      prompt: text,
    })
    gate.record(CLASSIFY_USD)

    return (result.data.facts ?? [])
      .map((f): PersonalFact | null => {
        const factContent = typeof f.content === "string" ? f.content.trim() : ""
        const category = typeof f.category === "string" ? f.category.trim().toLowerCase() : ""
        if (!factContent || !isPersonalFactCategory(category)) return null
        const confidence =
          typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.5
        return { category, content: factContent, confidence }
      })
      .filter((f): f is PersonalFact => f !== null)
      .slice(0, 5)
  } catch (error) {
    console.warn(
      "[personal-memory] salience classifier failed:",
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

export type PersonalCrudVerb = "add" | "noop"

/**
 * mem0-style ADD/NOOP decision for one incoming fact against the existing
 * personal items. Reuses `resolveMemoryConflict` (truth-weighted + recency) so
 * there's no second conflict engine:
 *   - no same-topic existing item  -> add (new fact)
 *   - same topic, incoming wins     -> add (update; worker closes the loser)
 *   - same topic, existing wins/tie -> noop (existing is as good or better)
 */
export function decidePersonalCrud(
  incoming: MemoryItemForConflictResolution,
  existing: MemoryItemForConflictResolution[],
): { verb: PersonalCrudVerb; matchedId?: string } {
  for (const item of existing) {
    const winner = resolveMemoryConflict(item, incoming)
    if (winner === null) continue
    if (winner === item) return { verb: "noop", matchedId: item.id }
    return { verb: "add", matchedId: item.id }
  }
  return { verb: "add" }
}

export interface RoutePersonalMemoryOptions {
  /** Source surface to stamp on derived personal facts. */
  sourceSurface?: string | null
  /** Override classifier deps (tests). */
  classifyDeps?: ClassifyDeps
}

/**
 * Derive durable user facts from a captured text and route the high-confidence
 * ones into the user's personal project. Best-effort + fire-and-forget — never
 * throws into the caller. The original capture into `activeProjectId` is the
 * caller's responsibility and is unaffected by this routine.
 *
 * Soak: writes happen only when `RELAY_PERSONAL_MEMORY_AUTOWRITE === "true"`
 * AND confidence >= PERSONAL_SALIENCE_WRITE_THRESHOLD. Everything else is logged.
 */
export async function routePersonalMemory(
  userId: string,
  activeProjectId: string,
  content: string,
  options: RoutePersonalMemoryOptions = {},
): Promise<void> {
  try {
    const repositories = createRepositoryBundle(userId)
    const personal = await repositories.projects.getPersonalProject(userId)
    if (!personal) return
    // A write whose target already is the personal project is a manual personal
    // capture — manual picks win, so don't re-route.
    if (personal.id === activeProjectId) return

    const facts = await classifyPersonalSalience(content, options.classifyDeps)
    if (facts.length === 0) return

    const autoWriteEnabled = process.env.RELAY_PERSONAL_MEMORY_AUTOWRITE === "true"

    // Load existing personal items once for the ADD/NOOP decision.
    const existingRows = await repositories.memory.listByProject(personal.id, {
      types: ["note"],
      limit: 200,
    })
    const existing: MemoryItemForConflictResolution[] = existingRows.map((row) => ({
      id: row.id,
      content: row.content,
      capturedAt: row.capturedAt,
      type: row.type,
      pinned: row.pinned,
      sourceSurface: row.sourceSurface,
      metadata: row.metadata,
    }))

    for (const fact of facts) {
      const eligible = autoWriteEnabled && fact.confidence >= PERSONAL_SALIENCE_WRITE_THRESHOLD
      if (!eligible) {
        // Soak: log the candidate for prompt tuning, never write.
        await logServerEvent({
          level: "info",
          surface: "web-api",
          area: "memory",
          event: "memory.personal_fact_skipped",
          message: "Personal fact candidate not written (soak/below-threshold).",
          userId,
          context: {
            category: fact.category,
            confidence: fact.confidence,
            autoWriteEnabled,
            derivedFromProjectId: activeProjectId,
            content: fact.content,
          },
        })
        continue
      }

      const decision = decidePersonalCrud(
        {
          id: "incoming",
          content: fact.content,
          capturedAt: new Date().toISOString(),
          type: "note",
        },
        existing,
      )
      if (decision.verb === "noop") {
        await logServerEvent({
          level: "info",
          surface: "web-api",
          area: "memory",
          event: "memory.personal_fact_noop",
          message: "Personal fact already represented — skipped.",
          userId,
          context: {
            category: fact.category,
            matchedId: decision.matchedId,
            derivedFromProjectId: activeProjectId,
          },
        })
        continue
      }

      const created = await createMemoryItem(userId, {
        projectId: personal.id,
        type: "note",
        content: fact.content,
        sourceSurface: options.sourceSurface ?? "auto",
        capturedAt: new Date().toISOString(),
        metadata: {
          source: "personal-router",
          autoRouted: true,
          personalCategory: fact.category,
          salienceConfidence: fact.confidence,
          derivedFromProjectId: activeProjectId,
          authority: "inferred",
          durability: "durable",
          validationState: "inferred",
        },
      })
      // Keep the in-memory existing set current so later facts in the same
      // batch dedupe against just-added ones.
      existing.push({
        id: created.id,
        content: created.content,
        capturedAt: created.capturedAt,
        type: created.type,
        pinned: created.pinned,
        sourceSurface: created.sourceSurface,
        metadata: created.metadata,
      })
    }
  } catch (error) {
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "memory",
      event: "memory.personal_routing_failed",
      message: "Personal-memory routing failed.",
      userId,
      context: { derivedFromProjectId: activeProjectId },
      error,
    }).catch(() => {})
  }
}
