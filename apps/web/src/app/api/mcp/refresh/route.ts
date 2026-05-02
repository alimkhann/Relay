import { NextResponse } from "next/server"

import { withApiRoute } from "@/server/http/api-route"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { refreshMcpAccessToken } from "@/server/services/mcp-token-service"

export const POST = withApiRoute(async (request: Request) => {
  await assertIpRateLimit(request, "mcp_refresh_ip", 60)
  const body = await request.json() as { refreshToken?: unknown }
  if (typeof body.refreshToken !== "string") {
    return NextResponse.json({ error: "refreshToken is required." }, { status: 400 })
  }

  const result = await refreshMcpAccessToken(body.refreshToken)
  return NextResponse.json(result)
})
