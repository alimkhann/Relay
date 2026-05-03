import { NextResponse } from "next/server"

import { withApiRoute } from "@/server/http/api-route"
import { revokeMcpToken } from "@/server/services/mcp-token-service"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"

export const POST = withApiRoute(async (request: Request) => {
  await assertIpRateLimit(request, "mcp_revoke_ip", 10)
  const body = await request.json() as { accessToken?: unknown }
  if (typeof body.accessToken !== "string") {
    return NextResponse.json({ error: "accessToken is required." }, { status: 400 })
  }

  await revokeMcpToken(body.accessToken)
  return NextResponse.json({ revoked: true })
})
