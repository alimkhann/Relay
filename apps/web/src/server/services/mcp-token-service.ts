import { createHash, randomBytes, randomInt } from "node:crypto"

import { createRepositoryBundle } from "@relay/db"
import type { McpTokenScope } from "@relay/shared"
import { hashContent } from "@relay/shared"

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let index = 0; index < 8; index += 1) {
    if (index === 4) code += "-"
    code += chars[randomInt(chars.length)]
  }
  return code
}

function buildAccessToken() {
  return `relay_mcp_${randomBytes(24).toString("hex")}`
}

function buildRefreshToken() {
  return `relay_refresh_${randomBytes(32).toString("hex")}`
}

function sha256Base64Url(input: string) {
  return createHash("sha256").update(input).digest("base64url")
}

export async function startMcpAuthorization(input: {
  projectId: string
  codeChallenge: string
  scopes: McpTokenScope[]
}) {
  const repositories = createRepositoryBundle()
  const sessionCode = generateSessionCode()
  const sessionSecret = `relay_mcp_auth_${randomBytes(16).toString("hex")}`
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  await repositories.mcpAuthSessions.create({
    sessionCode,
    sessionHash: hashContent(sessionSecret),
    sessionPrefix: sessionSecret.slice(0, 18),
    codeChallenge: input.codeChallenge,
    projectId: input.projectId,
    scopes: input.scopes,
    expiresAt,
  })

  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "https://onrelay.app"

  return {
    sessionCode,
    sessionSecret,
    expiresAt,
    appUrl,
  }
}

export async function approveMcpAuthorization(sessionCode: string, userId: string) {
  const repositories = createRepositoryBundle()
  const session = await repositories.mcpAuthSessions.getByCode(sessionCode)
  if (!session) {
    throw new Error("Invalid or expired MCP authorization session.")
  }

  const userRepositories = createRepositoryBundle(userId)
  const project = await userRepositories.projects.getById(session.projectId)
  if (!project) {
    throw new Error("Project not found for this MCP authorization request.")
  }

  await repositories.mcpAuthSessions.approve(session.id, userId)
}

export async function pollMcpAuthorization(sessionSecret: string, codeVerifier?: string) {
  const repositories = createRepositoryBundle()
  const session = await repositories.mcpAuthSessions.getByHash(hashContent(sessionSecret))
  if (!session) {
    return { status: "invalid" as const }
  }

  if (session.status === "pending") {
    return { status: "pending" as const }
  }

  if (session.status === "exchanged") {
    return { status: "invalid" as const }
  }

  if (!codeVerifier || sha256Base64Url(codeVerifier) !== session.codeChallenge || !session.userId) {
    return { status: "pending" as const }
  }

  const claimed = await repositories.mcpAuthSessions.claimApproved(session.id)
  if (!claimed) {
    return { status: "invalid" as const }
  }

  const accessToken = buildAccessToken()
  const refreshToken = buildRefreshToken()
  const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await repositories.mcpTokens.create({
    userId: session.userId,
    projectId: session.projectId,
    tokenHash: hashContent(accessToken),
    tokenPrefix: accessToken.slice(0, 16),
    scopes: session.scopes,
    expiresAt: accessExpiresAt,
    refreshTokenHash: hashContent(refreshToken),
    refreshTokenPrefix: refreshToken.slice(0, 16),
    refreshExpiresAt,
  })
  await repositories.mcpAuthSessions.markExchanged({
    id: session.id,
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
  })

  return {
    status: "approved" as const,
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    projectId: session.projectId,
    scopes: session.scopes,
    apiBase: process.env["NEXT_PUBLIC_APP_URL"] ?? "https://onrelay.app"
  }
}

export async function refreshMcpAccessToken(refreshToken: string) {
  const repositories = createRepositoryBundle()
  const existing = await repositories.mcpTokens.getValidRefreshTokenByHash(hashContent(refreshToken))
  if (!existing) {
    throw new Error("Refresh token is invalid or expired.")
  }

  await repositories.mcpTokens.touch(existing.id)

  const accessToken = buildAccessToken()
  const nextRefreshToken = buildRefreshToken()
  const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await repositories.mcpTokens.rotate({
    id: existing.id,
    tokenHash: hashContent(accessToken),
    tokenPrefix: accessToken.slice(0, 16),
    expiresAt: accessExpiresAt,
    refreshTokenHash: hashContent(nextRefreshToken),
    refreshTokenPrefix: nextRefreshToken.slice(0, 16),
    refreshExpiresAt,
  })

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    projectId: existing.projectId,
    scopes: existing.scopes,
    apiBase: process.env["NEXT_PUBLIC_APP_URL"] ?? "https://onrelay.app"
  }
}

export async function revokeMcpToken(accessToken: string) {
  const repositories = createRepositoryBundle()
  const existing = await repositories.mcpTokens.getValidAccessTokenByHash(hashContent(accessToken))
  if (existing) {
    await repositories.mcpTokens.revoke(existing.id)
  }
}
