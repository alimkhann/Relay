import { createRepositoryBundle } from "@relay/db"
import {
  memoryItemTypes,
  type MemoryItemRow,
  type MemoryItemType,
} from "@relay/shared"

import { runGeminiJsonWithFallback } from "./gemini-service"
import { updateMemoryItem } from "./memory-service"
import { buildPipelineBudgetGate, type PipelineBudgetGate } from "./memory-pipeline-providers"
import { refinePersonalCategory, regeneratePersonalState } from "./personal-memory-service"

const TYPE_CLASSIFY_MODEL_PRIMARY =
  process.env.GEMINI_MODEL_EXTRACTION_PRIMARY ?? "gemini-3.1-flash-lite"
const TYPE_CLASSIFY_MODEL_FALLBACK =
  process.env.GEMINI_MODEL_EXTRACTION_FALLBACK ?? "gemini-2.5-flash-lite"

const TYPE_CLASSIFY_MAX_INPUT = 2_500
const TYPE_CLASSIFY_MAX_OUTPUT = 120
const TYPE_CLASSIFY_USD = 0.001
const TAXONOMY_BACKFILL_VERSION = "memory-taxonomy-backfill-v1"

interface TypeModel {
  type?: string
}

interface TypeClassifyDeps {
  runJson?: typeof runGeminiJsonWithFallback
  gate?: PipelineBudgetGate
}

let sharedGate: PipelineBudgetGate | null = null

function taxonomyGate() {
  if (!sharedGate) sharedGate = buildPipelineBudgetGate()
  return sharedGate
}

function clampLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 50, 1), 200)
}

function isMemoryType(value: string | undefined): value is MemoryItemType {
  return Boolean(value && memoryItemTypes.includes(value as MemoryItemType))
}

export async function classifyProjectMemoryType(
  item: Pick<MemoryItemRow, "title" | "content">,
  deps: TypeClassifyDeps = {},
): Promise<MemoryItemType> {
  const content = item.content.trim()
  if (!content) return "note"

  const gate = deps.gate ?? taxonomyGate()
  if (!gate.shouldRun(TYPE_CLASSIFY_USD)) return "note"

  try {
    const runJson = deps.runJson ?? runGeminiJsonWithFallback
    const result = await runJson<TypeModel>({
      primaryModel: TYPE_CLASSIFY_MODEL_PRIMARY,
      fallbackModel: TYPE_CLASSIFY_MODEL_FALLBACK,
      maxInputTokens: TYPE_CLASSIFY_MAX_INPUT,
      maxOutputTokens: TYPE_CLASSIFY_MAX_OUTPUT,
      systemInstruction: [
        "Classify one Relay project memory item into the single best memory type.",
        'Return JSON exactly in this shape: {"type":"..."}',
        `type must be one of {${memoryItemTypes.join(", ")}}.`,
        "decision = a chosen course of action or settled answer.",
        "constraint = a rule, limit, invariant, preference, budget, policy, or non-negotiable.",
        "requirement = requested product behavior, implementation spec, acceptance criterion, or user-visible expectation.",
        "task = an open action item, follow-up, todo, or planned work.",
        "artifact = a concrete produced asset, document, release, branch, PR, file, build, deployment, or zip.",
        "note = general context or reference that is not better represented by another type.",
        "Prefer precision over cleverness. If the text is ambiguous, choose note.",
      ].join("\n"),
      prompt: [`Title: ${item.title ?? "(none)"}`, "", "Content:", content].join("\n"),
    })
    gate.record(TYPE_CLASSIFY_USD)
    return isMemoryType(result.data.type) ? result.data.type : "note"
  } catch (error) {
    console.warn(
      "[memory-taxonomy-backfill] type classification failed:",
      error instanceof Error ? error.message : error,
    )
    return "note"
  }
}

export interface MemoryTaxonomyBackfillResult {
  limit: number
  projectsScanned: number
  personal: {
    scanned: number
    categorized: number
  }
  projectTypes: {
    scanned: number
    retagged: number
    keptNote: number
  }
  projects: Array<{
    projectId: string
    kind: "project" | "personal"
    scanned: number
    categorized?: number
    retagged?: number
    keptNote?: number
  }>
}

export async function backfillMemoryTaxonomyForUser(
  userId: string,
  opts: {
    limit?: number
    includePersonalCategories?: boolean
    includeProjectTypes?: boolean
    classifyDeps?: TypeClassifyDeps
  } = {},
): Promise<MemoryTaxonomyBackfillResult> {
  const limit = clampLimit(opts.limit)
  const includePersonalCategories = opts.includePersonalCategories ?? true
  const includeProjectTypes = opts.includeProjectTypes ?? true
  const repositories = createRepositoryBundle(userId)
  const projects = await repositories.projects.listByOwner(userId, { includePersonal: true })
  const perProjectLimit = Math.max(1, Math.floor(limit / Math.max(projects.length, 1)))

  const result: MemoryTaxonomyBackfillResult = {
    limit,
    projectsScanned: projects.length,
    personal: { scanned: 0, categorized: 0 },
    projectTypes: { scanned: 0, retagged: 0, keptNote: 0 },
    projects: [],
  }

  let touchedPersonal = false

  for (const project of projects) {
    if (project.kind === "personal") {
      if (!includePersonalCategories) continue
      const rows = await repositories.memory.listPersonalItemsMissingCategory(project.id, perProjectLimit)
      let categorized = 0
      for (const row of rows) {
        const did = await refinePersonalCategory(userId, row)
        if (did) {
          categorized += 1
          touchedPersonal = true
        }
      }
      result.personal.scanned += rows.length
      result.personal.categorized += categorized
      result.projects.push({ projectId: project.id, kind: project.kind, scanned: rows.length, categorized })
      continue
    }

    if (!includeProjectTypes) continue
    const rows = await repositories.memory.listAgentNoteTypeBackfillCandidates(project.id, perProjectLimit)
    let retagged = 0
    let keptNote = 0
    for (const row of rows) {
      const nextType = await classifyProjectMemoryType(row, opts.classifyDeps)
      const nextMetadata = {
        ...(row.metadata ?? {}),
        taxonomyBackfilledAt: new Date().toISOString(),
        taxonomyBackfilledBy: TAXONOMY_BACKFILL_VERSION,
        taxonomyBackfilledFromType: row.type,
      }
      await updateMemoryItem(userId, row.id, {
        type: nextType,
        metadata: nextMetadata,
      }, row.projectId)
      if (nextType === "note") keptNote += 1
      else retagged += 1
    }
    result.projectTypes.scanned += rows.length
    result.projectTypes.retagged += retagged
    result.projectTypes.keptNote += keptNote
    result.projects.push({ projectId: project.id, kind: project.kind, scanned: rows.length, retagged, keptNote })
  }

  if (touchedPersonal) {
    await regeneratePersonalState(userId)
  }

  return result
}
