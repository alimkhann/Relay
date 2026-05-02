import { NextResponse } from "next/server"

import { withApiAuth, withApiRoute } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { approveMcpAuthorization, startMcpAuthorization } from "@/server/services/mcp-token-service"

function parseStartInput(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid MCP authorization request.")
  }

  const payload = input as { projectId?: unknown; codeChallenge?: unknown; scopes?: unknown }
  if (typeof payload.projectId !== "string" || typeof payload.codeChallenge !== "string" || !Array.isArray(payload.scopes)) {
    throw new Error("Invalid MCP authorization request.")
  }

  return {
    projectId: payload.projectId,
    codeChallenge: payload.codeChallenge,
    scopes: payload.scopes.filter((scope): scope is "project:read" | "project:write" | "memory:read" | "memory:write" | "brief:read" =>
      typeof scope === "string" && ["project:read", "project:write", "memory:read", "memory:write", "brief:read"].includes(scope)
    )
  }
}

function parseApproveInput(input: unknown) {
  if (!input || typeof input !== "object" || typeof (input as { sessionCode?: unknown }).sessionCode !== "string") {
    throw new Error("Invalid MCP approval request.")
  }

  return { sessionCode: (input as { sessionCode: string }).sessionCode }
}

export const POST = withApiRoute(async (request: Request) => {
  await assertIpRateLimit(request, "mcp_token_start_ip", 5)
  const body = await request.json()
  const parsed = parseStartInput(body)
  const result = await startMcpAuthorization(parsed)
  return NextResponse.json(result, { status: 201 })
})

export const PATCH = withApiAuth(async (request: Request) => {
  await assertIpRateLimit(request, "mcp_token_approve_ip", 10)
  const viewer = await requireSessionViewer()
  const body = parseApproveInput(await request.json())
  await approveMcpAuthorization(body.sessionCode, viewer.userId)
  return NextResponse.json({ approved: true })
})
