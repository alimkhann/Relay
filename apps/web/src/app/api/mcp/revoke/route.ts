import { NextResponse } from "next/server"

import { withApiRoute } from "@/server/http/api-route"
import { revokeMcpToken } from "@/server/services/mcp-token-service"

export const POST = withApiRoute(async (request: Request) => {
  const body = await request.json() as { accessToken?: unknown }
  if (typeof body.accessToken !== "string") {
    return NextResponse.json({ error: "accessToken is required." }, { status: 400 })
  }

  await revokeMcpToken(body.accessToken)
  return NextResponse.json({ revoked: true })
})
