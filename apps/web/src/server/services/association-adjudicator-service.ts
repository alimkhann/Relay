import { runGeminiJsonWithFallback, GEMINI_MODELS } from "./gemini-service"

export interface AssociationCandidateInput {
  projectId: string
  name: string
  description?: string | null
  keywords?: string[] | null
  heuristicScore: number
  heuristicReasons: string[]
}

export interface AssociationAdjudicationResult {
  decision: "auto-save" | "hold" | "ignore"
  candidateProjectId: string | null
  candidateProjectName: string | null
  confidence: "high" | "medium" | "low"
  reasons: string[]
}

export async function adjudicateProjectAssociation(input: {
  title?: string | null
  recentUserTurnText?: string | null
  recentRoutingText?: string | null
  fullVisibleRoutingText?: string | null
  candidates: AssociationCandidateInput[]
  heuristicMode: "auto-save" | "hold" | "ignore"
  heuristicConfidence: "high" | "medium" | "low"
}): Promise<AssociationAdjudicationResult | null> {
  if (input.candidates.length === 0) {
    return null
  }

  const truncatedCandidates = input.candidates.slice(0, 3)
  const result = await runGeminiJsonWithFallback<{
    decision?: "auto-save" | "hold" | "ignore"
    candidateProjectId?: string | null
    confidence?: "high" | "medium" | "low"
    reason?: string
  }>({
    primaryModel: GEMINI_MODELS.adjudication.primary,
    fallbackModel: GEMINI_MODELS.adjudication.fallback,
    maxInputTokens: GEMINI_MODELS.adjudication.maxInputTokens,
    maxOutputTokens: GEMINI_MODELS.adjudication.maxOutputTokens,
    systemInstruction:
      "You decide whether an AI chat should be automatically associated to a Relay project. Return only JSON. Be conservative. Only return auto-save when the chat is clearly advancing that project and the best candidate clearly dominates. If a project is mentioned only for reference, comparison, or passing context, do not auto-save it.",
    prompt: [
      "Return JSON with exactly: decision, candidateProjectId, confidence, reason.",
      "decision must be one of: auto-save, hold, ignore.",
      "Treat bare project-name mentions as weak evidence.",
      "If the project is mentioned only for reference, comparison, or incidental context, return ignore.",
      "If the project seems relevant but the evidence is still ambiguous or name-only, return hold instead of auto-save.",
      "Only return auto-save when the chat is obviously about ongoing work for that project, not merely naming it.",
      `Heuristic mode: ${input.heuristicMode}`,
      `Heuristic confidence: ${input.heuristicConfidence}`,
      ...(input.title ? [`Chat title: ${input.title}`] : []),
      ...(input.recentUserTurnText ? [`Latest user turn: ${input.recentUserTurnText}`] : []),
      ...(input.recentRoutingText ? [`Recent routing text: ${input.recentRoutingText}`] : []),
      ...(input.fullVisibleRoutingText ? [`Visible chat excerpt: ${input.fullVisibleRoutingText.slice(0, 2000)}`] : []),
      "Candidate projects:",
      ...truncatedCandidates.map((candidate, index) => [
        `${index + 1}. ${candidate.name} (${candidate.projectId})`,
        candidate.description ? `Description: ${candidate.description}` : null,
        candidate.keywords?.length ? `Keywords: ${candidate.keywords.join(", ")}` : null,
        `Heuristic score: ${candidate.heuristicScore}`,
        `Heuristic reasons: ${candidate.heuristicReasons.join(" | ")}`,
      ].filter(Boolean).join("\n")),
    ].join("\n\n"),
  })

  const decision = result.data.decision
  const confidence = result.data.confidence
  if (
    (decision !== "auto-save" && decision !== "hold" && decision !== "ignore") ||
    (confidence !== "high" && confidence !== "medium" && confidence !== "low")
  ) {
    return null
  }

  const candidate = truncatedCandidates.find((item) => item.projectId === result.data.candidateProjectId) ?? null

  return {
    decision,
    candidateProjectId: candidate?.projectId ?? null,
    candidateProjectName: candidate?.name ?? null,
    confidence,
    reasons: [result.data.reason?.trim() || "AI association adjudication completed."],
  }
}
