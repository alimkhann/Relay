import type { MemoryItemRow, MemoryRelationRow, MemoryRelationType } from "@relay/shared"
import type { MemoryRepository } from "@relay/db"

import { emitAiRequestCompleted } from "./ai-analytics-service"
import { GEMINI_MODELS, runGeminiJsonWithFallback } from "./gemini-service"

const LOG_PREFIX = "[relation-service]"

const HIGH_SIMILARITY_THRESHOLD = 0.85

interface ClassificationInput {
  title: string | null
  content: string
  type: string
}

interface ClassificationResult {
  relationType: MemoryRelationType
  confidence: number
}

export async function classifyRelation(
  itemA: ClassificationInput,
  itemB: ClassificationInput
): Promise<ClassificationResult | null> {
  const startedAtMs = Date.now()
  try {
    const result = await runGeminiJsonWithFallback<{
      relationType?: MemoryRelationType | null
      confidence?: number
    }>({
      primaryModel: GEMINI_MODELS.adjudication.primary,
      fallbackModel: GEMINI_MODELS.adjudication.fallback,
      maxInputTokens: GEMINI_MODELS.adjudication.maxInputTokens,
      maxOutputTokens: GEMINI_MODELS.adjudication.maxOutputTokens,
      systemInstruction: [
        "Classify the relationship between two memory items. Return JSON with relationType and confidence.",
        "relationType must be one of: supersedes, extends, derives, or null.",
        "supersedes: A replaces or overrides B (e.g. updated decision).",
        "extends: A adds detail to B without replacing it.",
        "derives: A is a logical consequence of B.",
        "null: no meaningful relationship.",
        "confidence: 0-1 float indicating certainty.",
      ].join(" "),
      prompt: [
        `A [${itemA.type}]: ${itemA.title ? itemA.title + " — " : ""}${itemA.content}`,
        `B [${itemB.type}]: ${itemB.title ? itemB.title + " — " : ""}${itemB.content}`,
        "Return JSON: { relationType, confidence }",
      ].join("\n"),
    })

    const { relationType, confidence } = result.data

    if (!relationType || !["supersedes", "extends", "derives"].includes(relationType)) {
      await emitAiRequestCompleted({
        operation: "memory_relation_classification",
        jobKind: "relation_adjudication",
        primaryModel: result.primaryModel,
        actualModel: result.actualModel,
        fallbackUsed: result.fallbackUsed,
        tokenUsage: result.tokenUsage,
        latencyMs: Math.max(0, Date.now() - startedAtMs),
        success: true,
      })
      return null
    }

    await emitAiRequestCompleted({
      operation: "memory_relation_classification",
      jobKind: "relation_adjudication",
      primaryModel: result.primaryModel,
      actualModel: result.actualModel,
      fallbackUsed: result.fallbackUsed,
      tokenUsage: result.tokenUsage,
      latencyMs: Math.max(0, Date.now() - startedAtMs),
      success: true,
    })

    return {
      relationType,
      confidence: typeof confidence === "number" ? Math.min(1, Math.max(0, confidence)) : 0.5,
    }
  } catch (error) {
    await emitAiRequestCompleted({
      operation: "memory_relation_classification",
      jobKind: "relation_adjudication",
      primaryModel: GEMINI_MODELS.adjudication.primary,
      actualModel: null,
      fallbackUsed: false,
      tokenUsage: null,
      latencyMs: Math.max(0, Date.now() - startedAtMs),
      success: false,
      failurePhase: "relation_classification",
    })
    console.log(LOG_PREFIX, "classification failed, skipping pair:", (error as Error).message)
    return null
  }
}

export async function detectRelations(
  newItem: MemoryItemRow,
  repos: { memory: MemoryRepository }
): Promise<MemoryRelationRow[]> {
  const similar = await repos.memory.findSimilar(newItem.id, {
    threshold: 0.7,
    limit: 5,
  })

  if (similar.length === 0) {
    console.log(LOG_PREFIX, `no similar items found for ${newItem.id}`)
    return []
  }

  console.log(LOG_PREFIX, `found ${similar.length} similar items for ${newItem.id}`)

  const relations: MemoryRelationRow[] = []

  for (const candidate of similar) {
    const isHighSimilarity = candidate.similarity >= HIGH_SIMILARITY_THRESHOLD

    const classification = await classifyRelation(
      { title: newItem.title, content: newItem.content, type: newItem.type },
      { title: candidate.title, content: candidate.content, type: candidate.type }
    )

    if (!classification) {
      continue
    }

    const confidence = isHighSimilarity
      ? classification.confidence
      : classification.confidence * 0.7

    console.log(
      LOG_PREFIX,
      `${newItem.id} -[${classification.relationType}]-> ${candidate.id}`,
      `(similarity=${candidate.similarity.toFixed(3)}, confidence=${confidence.toFixed(3)})`
    )

    const relation = await repos.memory.addRelation(
      newItem.id,
      candidate.id,
      classification.relationType,
      confidence
    )

    relations.push(relation)

    // Auto-archive superseded items with high confidence
    if (classification.relationType === "supersedes" && confidence > 0.75) {
      try {
        await repos.memory.update(candidate.id, {
          isArchived: true,
          metadata: {
            ...(candidate.metadata ?? {}),
            archivedBy: "supersession",
            supersededBy: newItem.id,
          },
        })
        console.log(LOG_PREFIX, `auto-archived superseded item ${candidate.id}`)
      } catch (error) {
        console.error(LOG_PREFIX, `failed to auto-archive ${candidate.id}:`, (error as Error).message)
      }
    }
  }

  console.log(LOG_PREFIX, `created ${relations.length} relations for ${newItem.id}`)

  return relations
}
