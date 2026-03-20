import { createHash, randomBytes } from "node:crypto"

import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import { hashContent } from "@relay/shared"

import { withApiRoute } from "@/server/http/api-route"
import { decryptSecret, encryptSecret } from "@/server/lib/secret-crypto"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { createExtensionTokenForUser } from "@/server/services/extension-token-service"

function buildAccessToken() {
  return `relay_mcp_${randomBytes(24).toString("hex")}`
}

function buildRefreshToken() {
  return `relay_refresh_${randomBytes(32).toString("hex")}`
}

function sha256Base64Url(input: string) {
  return createHash("sha256").update(input).digest("base64url")
}

/**
 * GET /api/wizard/auth/poll?secret=...&codeVerifier=...
 *
 * Combined polling endpoint. Once the user confirms in the browser,
 * this returns both a CLI token and scoped MCP tokens in one response.
 */
export const GET = withApiRoute(async (request: Request) => {
  await assertIpRateLimit(request, "wizard_auth_poll_ip", 15)

  const url = new URL(request.url)
  const secret = url.searchParams.get("secret")
  const codeVerifier = url.searchParams.get("codeVerifier")

  if (!secret) {
    return NextResponse.json({ status: "invalid" }, { status: 400 })
  }

  const repositories = createRepositoryBundle()

  // Step 1: Check CLI auth session
  const cliSession = await repositories.cliAuthSessions.getByHash(hashContent(secret))
  if (!cliSession) {
    return NextResponse.json({ status: "invalid" })
  }

  if (cliSession.status === "pending") {
    return NextResponse.json({ status: "pending" })
  }

  if (cliSession.status !== "confirmed" || !cliSession.userId) {
    return NextResponse.json({ status: "invalid" })
  }

  // Step 2: Get or create CLI token
  let cliToken: string
  if (cliSession.apiToken) {
    cliToken = decryptSecret(cliSession.apiToken)
  } else {
    const { token } = await createExtensionTokenForUser(cliSession.userId, {
      deviceName: cliSession.deviceName,
      purpose: "cli_mcp"
    })
    await repositories.cliAuthSessions.markTokenIssued(cliSession.id, encryptSecret(token))
    cliToken = token
  }

  // Step 3: Exchange MCP token if codeVerifier provided
  const mcpSession = await repositories.mcpAuthSessions.getByHash(
    hashContent(`wizard_mcp_${secret}`)
  )

  if (!mcpSession || !codeVerifier) {
    // Return just the CLI token if no MCP session found
    return NextResponse.json({
      status: "confirmed",
      cliToken,
      apiBase: process.env["NEXT_PUBLIC_APP_URL"] ?? "https://onrelay.app"
    })
  }

  // Approve MCP session if still pending (wizard auto-confirms both)
  if (mcpSession.status === "pending") {
    await repositories.mcpAuthSessions.approve(mcpSession.id, cliSession.userId)
  }

  if (mcpSession.status === "exchanged") {
    return NextResponse.json({
      status: "confirmed",
      cliToken,
      apiBase: process.env["NEXT_PUBLIC_APP_URL"] ?? "https://onrelay.app"
    })
  }

  // Verify PKCE
  if (sha256Base64Url(codeVerifier) !== mcpSession.codeChallenge) {
    return NextResponse.json({ status: "invalid" })
  }

  const accessToken = buildAccessToken()
  const refreshToken = buildRefreshToken()
  const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const claimed = await repositories.provider.transaction(async (provider) => {
    const tx = createRepositoryBundle(undefined, provider)
    const exchangeable = await tx.mcpAuthSessions.claimApproved(mcpSession.id)
    if (!exchangeable) return false

    await tx.mcpTokens.create({
      userId: cliSession.userId!,
      projectId: mcpSession.projectId,
      tokenHash: hashContent(accessToken),
      tokenPrefix: accessToken.slice(0, 16),
      scopes: mcpSession.scopes,
      expiresAt: accessExpiresAt,
      refreshTokenHash: hashContent(refreshToken),
      refreshTokenPrefix: refreshToken.slice(0, 16),
      refreshExpiresAt,
    })
    await tx.mcpAuthSessions.markExchanged(mcpSession.id)
    return true
  })

  if (!claimed) {
    return NextResponse.json({
      status: "confirmed",
      cliToken,
      apiBase: process.env["NEXT_PUBLIC_APP_URL"] ?? "https://onrelay.app"
    })
  }

  return NextResponse.json({
    status: "confirmed",
    cliToken,
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    apiBase: process.env["NEXT_PUBLIC_APP_URL"] ?? "https://onrelay.app"
  })
})
