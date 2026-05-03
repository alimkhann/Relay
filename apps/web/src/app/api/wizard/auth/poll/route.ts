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

const WIZARD_DEFAULT_SCOPES = ["project:read", "project:write", "memory:read", "memory:write", "brief:read"] as const

/**
 * GET /api/wizard/auth/poll?secret=...&codeVerifier=...
 *
 * Once the user confirms in the browser, this returns the Relay API token and,
 * when a project can be resolved, a scoped MCP token.
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
  const userId = cliSession.userId

  // Step 2: Get or create CLI token
  let cliToken: string
  if (cliSession.apiToken) {
    cliToken = decryptSecret(cliSession.apiToken)
  } else {
    const { token } = await createExtensionTokenForUser(userId, {
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

  if (!codeVerifier) {
    // Return just the CLI token if no MCP session found
    return NextResponse.json({
      status: "confirmed",
      cliToken,
      apiBase: process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"
    })
  }

  const resolvedMcpSession = mcpSession ?? await (async () => {
    const scopedRepositories = createRepositoryBundle(userId)
    const projects = await scopedRepositories.projects.listByOwner(userId)
    const defaultProject = projects[0]
    if (!defaultProject) return null

    return {
      id: `wizard-default:${defaultProject.id}`,
      status: "approved" as const,
      projectId: defaultProject.id,
      scopes: [...WIZARD_DEFAULT_SCOPES],
      codeChallenge: sha256Base64Url(codeVerifier),
    }
  })()
  const isSyntheticSession = !mcpSession

  if (!resolvedMcpSession) {
    return NextResponse.json({
      status: "confirmed",
      cliToken,
      apiBase: process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"
    })
  }

  // Approve MCP session if still pending (wizard auto-confirms both)
  if (!isSyntheticSession && resolvedMcpSession.status === "pending") {
    await repositories.mcpAuthSessions.approve(resolvedMcpSession.id, userId)
  }

  if (!isSyntheticSession && resolvedMcpSession.status === "exchanged") {
    return NextResponse.json({
      status: "confirmed",
      cliToken,
      projectId: resolvedMcpSession.projectId,
      apiBase: process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"
    })
  }

  // Verify PKCE (only meaningful for real sessions; synthetic sessions derive
  // the challenge from the same verifier so the check is inherently satisfied)
  if (!isSyntheticSession && sha256Base64Url(codeVerifier) !== resolvedMcpSession.codeChallenge) {
    return NextResponse.json({ status: "invalid" })
  }

  const accessToken = buildAccessToken()
  const refreshToken = buildRefreshToken()
  const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const claimed = await repositories.provider.transaction(async (provider) => {
    const tx = createRepositoryBundle(undefined, provider)
    if (!isSyntheticSession) {
      const exchangeable = await tx.mcpAuthSessions.claimApproved(resolvedMcpSession.id)
      if (!exchangeable) return false
    }

    await tx.mcpTokens.create({
      userId,
      projectId: resolvedMcpSession.projectId,
      tokenHash: hashContent(accessToken),
      tokenPrefix: accessToken.slice(0, 16),
      scopes: resolvedMcpSession.scopes,
      expiresAt: accessExpiresAt,
      refreshTokenHash: hashContent(refreshToken),
      refreshTokenPrefix: refreshToken.slice(0, 16),
      refreshExpiresAt,
    })
    if (!isSyntheticSession) {
      await tx.mcpAuthSessions.markExchanged(resolvedMcpSession.id)
    }
    return true
  })

  if (!claimed) {
    return NextResponse.json({
      status: "confirmed",
      cliToken,
      projectId: resolvedMcpSession.projectId,
      apiBase: process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"
    })
  }

  return NextResponse.json({
    status: "confirmed",
    cliToken,
    projectId: resolvedMcpSession.projectId,
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    apiBase: process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"
  })
})
