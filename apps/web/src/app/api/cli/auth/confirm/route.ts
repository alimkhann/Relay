import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import { cliAuthConfirmSchema } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await requireSessionViewer()
  const body = cliAuthConfirmSchema.parse(await request.json())

  const repositories = createRepositoryBundle()
  const session = await repositories.cliAuthSessions.getByCode(body.sessionCode)

  if (!session) {
    return NextResponse.json(
      { error: "Invalid or expired session code." },
      { status: 400 }
    )
  }

  await repositories.cliAuthSessions.confirm(session.id, viewer.userId)

  return NextResponse.json({ confirmed: true })
})
