import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import { assistantFeedbackSchema } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"

export const PATCH = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const { id } = await params
  const { feedback } = assistantFeedbackSchema.parse(await request.json())

  const repositories = createRepositoryBundle(viewer.userId)
  const message = await repositories.assistantMessages.getById(id)
  if (!message || message.userId !== viewer.userId || message.role !== "assistant") {
    return NextResponse.json({ error: "Message not found." }, { status: 404 })
  }

  await repositories.assistantMessages.setFeedback(id, feedback)
  return NextResponse.json({ ok: true })
})
