import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { BadRequestError } from "@/server/http/errors"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { adjudicateProjectAssociation, type AssociationCandidateInput } from "@/server/services/association-adjudicator-service"

function parseAssociationRequest(input: unknown): {
  title: string | null
  recentUserTurnText: string | null
  recentRoutingText: string | null
  fullVisibleRoutingText: string | null
  heuristicMode: "auto-save" | "hold" | "ignore"
  heuristicConfidence: "high" | "medium" | "low"
  candidates: AssociationCandidateInput[]
} {
  if (!input || typeof input !== "object") {
    throw new BadRequestError("Association adjudication payload is invalid.")
  }

  const body = input as Record<string, unknown>
  const heuristicMode = body.heuristicMode
  const heuristicConfidence = body.heuristicConfidence
  const candidates = Array.isArray(body.candidates) ? body.candidates : []

  if (
    (heuristicMode !== "auto-save" && heuristicMode !== "hold" && heuristicMode !== "ignore") ||
    (heuristicConfidence !== "high" && heuristicConfidence !== "medium" && heuristicConfidence !== "low")
  ) {
    throw new BadRequestError("Association adjudication heuristic data is invalid.")
  }

  return {
    title: typeof body.title === "string" ? body.title : null,
    recentUserTurnText: typeof body.recentUserTurnText === "string" ? body.recentUserTurnText : null,
    recentRoutingText: typeof body.recentRoutingText === "string" ? body.recentRoutingText : null,
    fullVisibleRoutingText: typeof body.fullVisibleRoutingText === "string" ? body.fullVisibleRoutingText : null,
    heuristicMode,
    heuristicConfidence,
    candidates: candidates
      .map((candidate) => {
        if (!candidate || typeof candidate !== "object") return null
        const value = candidate as Record<string, unknown>
        if (typeof value.projectId !== "string" || typeof value.name !== "string") return null
        return {
          projectId: value.projectId,
          name: value.name,
          description: typeof value.description === "string" ? value.description : null,
          keywords: Array.isArray(value.keywords) ? value.keywords.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
          heuristicScore: typeof value.heuristicScore === "number" ? value.heuristicScore : 0,
          heuristicReasons: Array.isArray(value.heuristicReasons)
            ? value.heuristicReasons.filter((item): item is string => typeof item === "string").slice(0, 6)
            : [],
        }
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .slice(0, 3),
  }
}

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const parsed = parseAssociationRequest(await request.json())
  const result = await adjudicateProjectAssociation(parsed)

  return NextResponse.json({ result })
})
