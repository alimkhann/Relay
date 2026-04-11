import { NextResponse } from "next/server"
import { z } from "zod"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import {
  flushWorkSession,
  sweepOpenWorkSessions,
} from "@/server/services/work-session-flush-service"

const structuredStateSchema = z
  .object({
    summary: z.string().nullable().optional(),
    progress: z.string().nullable().optional(),
    currentObjective: z.string().nullable().optional(),
    decisions: z.array(z.string()).optional(),
    constraints: z.array(z.string()).optional(),
    nextSteps: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional(),
    relevantTools: z.array(z.string()).optional(),
    touchedFiles: z.array(z.string()).optional(),
    reaffirmedFacts: z.array(z.string()).optional(),
  })
  .nullable()
  .optional()

const flushRequestSchema = z.object({
  /** When omitted, the route sweeps all open sessions for this viewer+project. */
  sessionId: z.string().min(1).optional(),
  reason: z
    .enum(["precompact", "session_end", "stop", "sweep", "explicit"])
    .optional(),
  summaryShort: z.string().nullable().optional(),
  structuredState: structuredStateSchema,
  /** Sweep option: only flush sessions idle longer than this many ms. */
  idleMs: z.number().int().nonnegative().optional(),
  /** Sweep option: cap on number of sessions to flush in one call. */
  limit: z.number().int().positive().max(25).optional(),
})

export const POST = withApiAuth(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await resolveViewer(request.headers.get("authorization"))
    const { id } = await params
    requireViewerProject(viewer, id, "memory:write")

    const body = await request.json().catch(() => ({}))
    const parsed = flushRequestSchema.parse(body)

    if (parsed.sessionId) {
      const result = await flushWorkSession(viewer.userId, id, {
        sessionId: parsed.sessionId,
        reason: parsed.reason,
        summaryShort: parsed.summaryShort ?? null,
        structuredState: parsed.structuredState ?? null,
      })
      return NextResponse.json(result, { status: 200 })
    }

    const swept = await sweepOpenWorkSessions(viewer.userId, {
      projectId: id,
      idleMs: parsed.idleMs ?? 0,
      limit: parsed.limit ?? 3,
      reason: parsed.reason ?? "sweep",
    })
    return NextResponse.json(swept, { status: 200 })
  },
)
