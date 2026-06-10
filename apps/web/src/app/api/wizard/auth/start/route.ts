import { randomBytes, randomInt } from "node:crypto"

import { NextResponse } from "next/server"

import { createServiceRepositoryBundle } from "@relay/db"
import { hashContent } from "@relay/shared"

import { withApiRoute } from "@/server/http/api-route"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-"
    code += chars[randomInt(chars.length)]
  }
  return code
}

/**
 * POST /api/wizard/auth/start
 *
 * Starts a combined Relay auth session for the MCP wizard.
 * One browser visit grants the Relay API token and, when a project can be
 * resolved, a scoped MCP token.
 */
export const POST = withApiRoute(async (request: Request) => {
  await assertIpRateLimit(request, "wizard_auth_start_ip", 5)

  const body = (await request.json()) as {
    codeChallenge?: string
    projectId?: string
    scopes?: string[]
  }

  if (typeof body.codeChallenge !== "string") {
    return NextResponse.json({ error: "codeChallenge is required." }, { status: 400 })
  }

  const repositories = createServiceRepositoryBundle()
  const sessionCode = generateSessionCode()
  const pollingSecret = `relay_wizard_${randomBytes(16).toString("hex")}`
  const sessionHash = hashContent(pollingSecret)
  const sessionPrefix = pollingSecret.slice(0, 16)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  // Create a CLI auth session that also stores MCP params for combined exchange
  await repositories.cliAuthSessions.create({
    sessionCode,
    sessionHash,
    sessionPrefix,
    deviceName: "Wizard",
    expiresAt,
  })

  const scopes = (body.scopes ?? []).filter((scope): scope is "project:read" | "project:write" | "memory:read" | "memory:write" | "brief:read" =>
    typeof scope === "string" && ["project:read", "project:write", "memory:read", "memory:write", "brief:read"].includes(scope)
  )

  if (typeof body.projectId === "string") {
    await repositories.mcpAuthSessions.create({
      sessionCode: `W${sessionCode}`,
      sessionHash: hashContent(`wizard_mcp_${pollingSecret}`),
      sessionPrefix: `wizard_mcp_${pollingSecret}`.slice(0, 18),
      codeChallenge: body.codeChallenge,
      projectId: body.projectId,
      scopes,
      expiresAt,
    })
  }

  const appUrl = process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"

  return NextResponse.json({
    sessionCode,
    pollingSecret,
    expiresAt,
    appUrl,
  })
})
