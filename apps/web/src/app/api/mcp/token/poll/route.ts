import { NextResponse } from "next/server"

import { withApiRoute } from "@/server/http/api-route"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { pollMcpAuthorization } from "@/server/services/mcp-token-service"

export const POST = withApiRoute(async (request: Request) => {
  await assertIpRateLimit(request, "mcp_token_poll_ip", 15)
  const body = await request.json() as { secret?: unknown; codeVerifier?: unknown }
  if (typeof body.secret !== "string") {
    return NextResponse.json({ status: "invalid" }, { status: 400 })
  }

  const result = await pollMcpAuthorization(
    body.secret,
    typeof body.codeVerifier === "string" ? body.codeVerifier : undefined
  )
  return NextResponse.json(result)
})
