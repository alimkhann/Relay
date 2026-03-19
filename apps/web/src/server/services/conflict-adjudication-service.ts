import { runGeminiJsonWithFallback, GEMINI_MODELS } from "./gemini-service"

interface ConflictCandidate {
  id: string
  type: "decision" | "constraint" | "task"
  content: string
  sourceSurface?: string | null
  metadata?: Record<string, unknown>
}

interface ConflictAdjudicationResult {
  verdict: "same" | "distinct" | "conflicting"
  preferredId: string | null
  reason: string
  actualModel: string
  fallbackUsed: boolean
}

export async function adjudicateGreyZoneConflict(input: {
  left: ConflictCandidate
  right: ConflictCandidate
}): Promise<ConflictAdjudicationResult | null> {
  const result = await runGeminiJsonWithFallback<{
    verdict?: "same" | "distinct" | "conflicting"
    preferredId?: string | null
    reason?: string
  }>({
    primaryModel: GEMINI_MODELS.adjudication.primary,
    fallbackModel: GEMINI_MODELS.adjudication.fallback,
    maxInputTokens: GEMINI_MODELS.adjudication.maxInputTokens,
    maxOutputTokens: GEMINI_MODELS.adjudication.maxOutputTokens,
    systemInstruction:
      "You adjudicate whether two Relay project memory items represent the same claim, distinct claims, or conflicting claims. Return only JSON. Be conservative: prefer distinct unless there is strong overlap.",
    prompt: [
      "Return JSON with exactly: verdict, preferredId, reason.",
      "verdict must be one of: same, distinct, conflicting.",
      "preferredId must be left, right, or null. Use left/right only when verdict is same or conflicting and one wording should dominate.",
      `Item type: ${input.left.type}`,
      `Left (${input.left.id}): ${input.left.content}`,
      `Right (${input.right.id}): ${input.right.content}`,
      `Left source: ${input.left.sourceSurface ?? "unknown"}`,
      `Right source: ${input.right.sourceSurface ?? "unknown"}`,
    ].join("\n\n"),
  })

  const verdict = result.data.verdict
  if (verdict !== "same" && verdict !== "distinct" && verdict !== "conflicting") {
    return null
  }

  const preferredId =
    result.data.preferredId === "left"
      ? input.left.id
      : result.data.preferredId === "right"
        ? input.right.id
        : null

  return {
    verdict,
    preferredId,
    reason: result.data.reason?.trim() || "AI adjudication completed.",
    actualModel: result.actualModel,
    fallbackUsed: result.fallbackUsed,
  }
}
