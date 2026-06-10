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
  personalCategories,
  personalCategoryFromMetadata,
  resolveMemoryConflict,
  type MemoryItemForConflictResolution,
  type MemoryItemRow,
  type SourceSurface,
} from "@relay/shared"

import { createRepositoryBundle } from "@relay/db"

import { invalidateProjectMemoryCache } from "@/server/cache/invalidation"
import { logServerEvent } from "@/server/logging/logger"
import {
  drainTinyMemoryPipelineBatch,
  enqueueMemoryPipelineJob,
  enqueuePersonalStateRegeneration,
  markProjectHygieneDue,
  personalMemoryItemCap,
} from "./memory-pipeline-scheduler"
import { buildPipelineBudgetGate, type PipelineBudgetGate } from "./memory-pipeline-providers"
import { runGeminiJsonWithFallback } from "./gemini-service"

const CLASSIFY_MODEL_PRIMARY =
  process.env.GEMINI_MODEL_EXTRACTION_PRIMARY ?? "gemini-3.1-flash-lite"
const CLASSIFY_MODEL_FALLBACK =
  process.env.GEMINI_MODEL_EXTRACTION_FALLBACK ?? "gemini-2.5-flash-lite"

const CLASSIFY_MAX_INPUT = 8_000
// Headroom for a full profile (a "what do you know about me" recap can yield
// 20+ atomic facts); 600 truncated mid-array and capped real extractions.
const CLASSIFY_MAX_OUTPUT = 2_400
const CLASSIFY_USD = 0.0015

/** Hard ceiling on facts per pass — generous so full profiles aren't clipped. */
const MAX_PERSONAL_FACTS_PER_PASS = 30

/** Facts at or above this confidence are eligible to write (when autowrite is on). */
export const PERSONAL_SALIENCE_WRITE_THRESHOLD = 0.7

/**
 * Facts in [UNSURE, WRITE) are surfaced as "unsure" — Relay found something that
 * looks personal but isn't confident enough to auto-write. Below UNSURE they're
 * treated as noise and dropped silently.
 */
export const PERSONAL_SALIENCE_UNSURE_THRESHOLD = 0.4

// Folk-style personal taxonomy. Single source of truth lives in
// @relay/shared (personalCategories) so the classifier, dashboard, graph, and
// extension all agree. These live ONLY in metadata.personalCategory (items
// store as type 'note') — not the project memory_items.type enum.
export const PERSONAL_FACT_CATEGORIES = personalCategories

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
  "You curate a person's long-term memory, the way ChatGPT memory, Claude, and mem0 do. You read a slice of their AI chat and extract ONLY durable facts about the user that would still be useful weeks or months from now.",
  'Return JSON exactly in this shape: {"facts":[{"category":"...","content":"...","confidence":0.0-1.0}]}',
  `category must be one of {${PERSONAL_FACT_CATEGORIES.join(", ")}}.`,
  'content = one atomic, standalone fact about the USER, third person, starting with "User ". Each fact is one idea (split compound facts). Resolve "I/me/my" to "User"; never use pronouns that need the chat for context.',
  "",
  "WHAT EACH CATEGORY MEANS (pick the single best fit per fact):",
  "- person: a specific person in their life/work — mentor, friend, family member, collaborator, manager. Name them when stated.",
  "- company: a company or organization relevant to them — employer, school/university, key vendor or tool provider they rely on.",
  "- concept: a durable idea/topic that defines them — a lasting preference, skill/proficiency, value, goal, constraint, interest, or what they build/work on. This is the catch-all for durable traits ('User prefers TypeScript', 'User is experienced in Go', 'User wants to get into YC', 'User optimizes hard for free tiers', 'User is building a cross-AI context tool').",
  "- event: a dated or scheduled milestone worth remembering ('User sits the SAT retake in Fall 2026').",
  "- meeting: a specific past conversation/call/session worth remembering as an episode (not a recurring trait).",
  "- signals: a notable behavioral signal or state — intent, momentum, a recent change in their situation ('User is on academic leave', 'User is preparing to relaunch university applications').",
  "- note: any other durable, user-centric fact that does not fit the categories above. Identity facts (name, age, location, nationality) go here.",
  "",
  "HARD REJECTS (return none of these):",
  "- Transient/in-the-moment state: the current bug, today's task, 'right now', a question being asked.",
  "- Questions or hypotheticals ('how do I...', 'should I...') — a question is not a fact.",
  "- Project-technical detail: API params, config values, code, error messages, file paths, schema. Those belong to a project, not personal memory.",
  "- General knowledge or facts about the world, the assistant, or third parties who are not the user's stable relationships.",
  "- Anything you are inferring beyond what the text actually supports. Do not guess.",
  "",
  "CONFIDENCE = how explicitly the user states this lasting fact about themselves. 0.9-1.0: user states it directly and durably ('I'm a vegetarian', 'I'm the founder of X'). 0.6-0.8: strongly implied and stable. <0.5: weak, momentary, or inferred — prefer to omit. When unsure whether something is durable, lower the confidence rather than dropping it silently.",
  "Bias toward precision over recall: a near-empty personal memory is far better than one polluted with transient or technical noise.",
  "When the text is a profile/recap that genuinely contains many durable facts, extract them ALL as separate atomic facts — do not summarize or drop the long tail.",
  'If nothing durable and user-centric is present, return {"facts":[]}.',
  `Return at most ${MAX_PERSONAL_FACTS_PER_PASS} facts, most important first.`,
].join("\n")

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
      .slice(0, MAX_PERSONAL_FACTS_PER_PASS)
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
 * Outcome of one routing pass, surfaced so the capture caller can show the user
 * a "saved N to Personal" / "N look personal — confirm?" toast.
 */
export interface PersonalRoutingResult {
  /** Personal project id, when one exists for the user. */
  personalProjectId: string | null
  /** Durable facts actually written into personal this pass. */
  written: number
  /** Borderline facts (confidence in [UNSURE, WRITE)) — found, not written. */
  unsure: number
  /** High-confidence facts that already existed (ADD/NOOP -> noop). */
  duplicate: number
  /** Newly written facts, included so callers can render truthful result cards. */
  createdItems?: Array<{
    id: string
    content: string
    type: string
    projectId: string | null
    metadata: Record<string, unknown>
  }>
}

function emptyRoutingResult(personalProjectId: string | null): PersonalRoutingResult {
  return { personalProjectId, written: 0, unsure: 0, duplicate: 0 }
}

/**
 * Write a batch of already-classified personal facts into the personal project,
 * applying the soak gate + mem0 ADD/NOOP dedupe. Shared by the auto-route path
 * (routePersonalMemory) and the personal-origin capture path (which classifies
 * the same way but must NOT early-return on activeProjectId === personal).
 */
async function writePersonalFacts(
  userId: string,
  personalProjectId: string,
  facts: PersonalFact[],
  options: { sourceSurface: string | null; derivedFromProjectId: string },
): Promise<PersonalRoutingResult> {
  const repositories = createRepositoryBundle(userId)
  const autoWriteEnabled = process.env.RELAY_PERSONAL_MEMORY_AUTOWRITE === "true"
  const createdItems: MemoryItemRow[] = []

  const result = await repositories.provider.transaction(async (provider) => {
    const tx = createRepositoryBundle(userId, provider)
    const result = emptyRoutingResult(personalProjectId)
    // Serialize even the first concurrent write, when there are no note rows
    // yet for SELECT ... FOR UPDATE to lock.
    await tx.provider.query(`select pg_advisory_xact_lock(hashtext($1))`, [personalProjectId])
    const existingRows = await tx.memory.listActiveNotesForUpdate(personalProjectId, personalMemoryItemCap())
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
        if (
          fact.confidence >= PERSONAL_SALIENCE_UNSURE_THRESHOLD &&
          fact.confidence < PERSONAL_SALIENCE_WRITE_THRESHOLD
        ) {
          result.unsure += 1
        }
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
            derivedFromProjectId: options.derivedFromProjectId,
            content: fact.content,
          },
        })
        continue
      }

      const capturedAt = new Date().toISOString()
      const decision = decidePersonalCrud(
        {
          id: "incoming",
          content: fact.content,
          capturedAt,
          type: "note",
        },
        existing,
      )
      if (decision.verb === "noop") {
        result.duplicate += 1
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
            derivedFromProjectId: options.derivedFromProjectId,
          },
        })
        continue
      }

      const created = await tx.memory.create(userId, {
        projectId: personalProjectId,
        type: "note",
        content: fact.content,
        sourceSurface: (options.sourceSurface ?? "auto") as SourceSurface,
        capturedAt,
        metadata: {
          source: "personal-router",
          autoRouted: true,
          personalCategory: fact.category,
          salienceConfidence: fact.confidence,
          derivedFromProjectId: options.derivedFromProjectId,
          authority: "inferred",
          durability: "durable",
          validationState: "inferred",
        },
      })
      await tx.projectState.markDirty(personalProjectId)
      await tx.memoryEvents.create({
        projectId: personalProjectId,
        memoryItemId: created.id,
        eventType: "created",
        sourceSurface: created.sourceSurface,
        userId,
        payload: { type: created.type, personal: true },
      })
      result.written += 1
      createdItems.push(created)
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

    if (result.written > 0) {
      await tx.memory.archiveOverBudget(personalProjectId, personalMemoryItemCap())
    }
    return result
  })

  if (result.written > 0) {
    try {
      await Promise.all([
        ...createdItems.map((item) => enqueueMemoryPipelineJob({
          jobType: "enrich_memory_item",
          userId,
          projectId: personalProjectId,
          memoryItemId: item.id,
          repositories,
        })),
        enqueuePersonalStateRegeneration(userId, personalProjectId, repositories),
        markProjectHygieneDue(personalProjectId, undefined, repositories),
      ])
      void drainTinyMemoryPipelineBatch()
    } catch (error) {
      console.warn("[personal-memory] enqueue jobs failed:", error instanceof Error ? error.message : error)
    }
    invalidateProjectMemoryCache(userId, personalProjectId)
  }
  return {
    ...result,
    createdItems: createdItems.map((item) => ({
      id: item.id,
      content: item.content,
      type: item.type,
      projectId: item.projectId,
      metadata: item.metadata,
    })),
  }
}

// ── Derived "About you" personal state ───────────────────────────────────────
// Personal projects have no digest pipeline, so we summarize the user's durable
// facts into the same project_state columns a regular project uses (overview +
// objective). The dashboard DTO merges this derived state with the user's manual
// override (project_state_overrides) exactly as it does for projects, so the
// Personal State card is editable and "reset to auto" comes for free.

const STATE_USD = 0.002
const STATE_MAX_OUTPUT = 700
/** Keep generated text within the override schema's edit limits (overview 500,
 * objective 320) so a manual edit round-trips. */
const STATE_ABOUT_MAX = 500
const STATE_GOALS_MAX = 320

const STATE_SYSTEM_INSTRUCTION = [
  "You maintain a concise 'About you' profile for a single user, written from a list of durable facts Relay has learned about them.",
  'Return JSON exactly in this shape: {"about":"...","goals":"..."}',
  `about = a warm 2-4 sentence summary of who the user is — identity, work, what they are building, and their defining traits/preferences. Address the user in second person ("You are…", "You prefer…"). Plain prose, no bullet points, no markdown. At most ${STATE_ABOUT_MAX} characters.`,
  `goals = one short second-person line on what the user is currently working toward, if the facts support one ("You are working toward…"). At most ${STATE_GOALS_MAX} characters. Empty string if the facts don't say.`,
  "Use only what the facts state — never invent or infer beyond them. If there is too little to summarize, return both fields as empty strings.",
].join("\n")

interface PersonalStateModel {
  about?: string
  goals?: string
}

/**
 * Regenerate the personal project's derived "About you" state from its memory
 * items and persist it to project_state. Best-effort + never throws; gated by
 * the shared classification budget. Triggered after personal facts are written
 * (auto-route, capture) and after a manual personal add.
 */
export async function regeneratePersonalState(
  userId: string,
  deps: ClassifyDeps = {},
): Promise<void> {
  try {
    const repositories = createRepositoryBundle(userId)
    const personal = await repositories.projects.getPersonalProject(userId)
    if (!personal) return

    const rows = await repositories.memory.listByProject(personal.id, {
      types: ["note"],
      limit: 200,
    })
    const facts = rows
      .map((row) => {
        const category = personalCategoryFromMetadata(row.metadata) ?? "note"
        const content = row.content?.trim()
        return content ? `- [${category}] ${content}` : null
      })
      .filter((line): line is string => line !== null)
    if (facts.length === 0) return

    const gate = deps.gate ?? classifyGate()
    if (!gate.shouldRun(STATE_USD)) return

    const runJson = deps.runJson ?? runGeminiJsonWithFallback
    const result = await runJson<PersonalStateModel>({
      primaryModel: CLASSIFY_MODEL_PRIMARY,
      fallbackModel: CLASSIFY_MODEL_FALLBACK,
      maxInputTokens: CLASSIFY_MAX_INPUT,
      maxOutputTokens: STATE_MAX_OUTPUT,
      systemInstruction: STATE_SYSTEM_INSTRUCTION,
      prompt: facts.join("\n"),
    })
    gate.record(STATE_USD)

    const about = (result.data.about ?? "").trim().slice(0, STATE_ABOUT_MAX)
    const goals = (result.data.goals ?? "").trim().slice(0, STATE_GOALS_MAX)
    if (!about && !goals) return

    const existing = await repositories.projectState.getByProject(personal.id)
    await repositories.projectState.upsert({
      projectId: personal.id,
      projectOverview: about || null,
      currentObjective: goals || null,
      stackDomain: existing?.stackDomain ?? null,
      recentProgress: existing?.recentProgress ?? null,
      // Personal state has no governed lists — those stay empty (the card only
      // reads overview + objective).
      decisions: [],
      constraints: [],
      openTasks: [],
      relevantTools: [],
      dirty: false,
    })
    // Bust the cached dashboard read-model so the "About you" card reflects the
    // new state immediately (mirrors the project digest pipeline).
    invalidateProjectMemoryCache(userId, personal.id)
  } catch (error) {
    console.warn(
      "[personal-memory] state regeneration failed:",
      error instanceof Error ? error.message : error,
    )
  }
}

/**
 * Personal-ORIGIN capture: the user explicitly captured a chat while parked on
 * their personal project. Classify the transcript and write salient user facts
 * directly — NEVER a project digest (no decisions/constraints/tasks/state/brief
 * in personal). Unlike routePersonalMemory there is no early-return, because the
 * personal project is the intended target here.
 */
export async function routePersonalFromTranscript(
  userId: string,
  content: string,
  options: RoutePersonalMemoryOptions = {},
): Promise<PersonalRoutingResult> {
  try {
    const repositories = createRepositoryBundle(userId)
    const personal = await repositories.projects.getPersonalProject(userId)
    if (!personal) return emptyRoutingResult(null)

    const facts = await classifyPersonalSalience(content, options.classifyDeps)
    if (facts.length === 0) return emptyRoutingResult(personal.id)

    return writePersonalFacts(userId, personal.id, facts, {
      sourceSurface: options.sourceSurface ?? null,
      derivedFromProjectId: personal.id,
    })
  } catch (error) {
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "memory",
      event: "memory.personal_routing_failed",
      message: "Personal-origin routing failed.",
      userId,
      context: { derivedFromProjectId: "personal" },
      error,
    }).catch(() => {})
    return emptyRoutingResult(null)
  }
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
): Promise<PersonalRoutingResult> {
  let personalProjectId: string | null = null
  try {
    const repositories = createRepositoryBundle(userId)
    const personal = await repositories.projects.getPersonalProject(userId)
    if (!personal) return emptyRoutingResult(null)
    personalProjectId = personal.id
    // A write whose target already is the personal project is a manual personal
    // capture — manual picks win, so don't re-route.
    if (personal.id === activeProjectId) return emptyRoutingResult(personal.id)

    const facts = await classifyPersonalSalience(content, options.classifyDeps)
    if (facts.length === 0) return emptyRoutingResult(personal.id)

    return writePersonalFacts(userId, personal.id, facts, {
      sourceSurface: options.sourceSurface ?? null,
      derivedFromProjectId: activeProjectId,
    })
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
    return emptyRoutingResult(personalProjectId)
  }
}
