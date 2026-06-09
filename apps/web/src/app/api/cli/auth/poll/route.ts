import { NextResponse } from "next/server"

import { createServiceRepositoryBundle } from "@relay/db"
import { hashContent } from "@relay/shared"

import { withApiRoute } from "@/server/http/api-route"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { decryptSecret, encryptSecret } from "@/server/lib/secret-crypto"
import { createExtensionTokenForUser } from "@/server/services/extension-token-service"

export const GET = withApiRoute(async (request: Request) => {
  await assertIpRateLimit(request, "cli_auth_poll_ip", 15)

  const url = new URL(request.url)
  const secret = url.searchParams.get("secret")

  if (!secret) {
    return NextResponse.json({ status: "invalid" }, { status: 400 })
  }

  const repositories = createServiceRepositoryBundle()
  const session = await repositories.cliAuthSessions.getByHash(hashContent(secret))

  if (!session) {
    return NextResponse.json({ status: "invalid" })
  }

  if (session.status === "pending") {
    return NextResponse.json({ status: "pending" })
  }

  if (session.status === "confirmed" && session.userId) {
    if (session.apiToken) {
      return NextResponse.json({
        status: "confirmed",
        token: decryptSecret(session.apiToken),
        apiBase: process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"
      })
    }

    const { token } = await createExtensionTokenForUser(session.userId, {
      deviceName: session.deviceName,
      purpose: "cli_mcp"
    })

    await repositories.cliAuthSessions.markTokenIssued(session.id, encryptSecret(token))

    return NextResponse.json({
      status: "confirmed",
      token,
      apiBase: process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"
    })
  }

  return NextResponse.json({ status: "invalid" })
})
