import { NextResponse } from "next/server"

import { BadRequestError } from "@/server/http/errors"
import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, rejectMcpViewer } from "@/server/policies/viewer"
import { consumeIpRateLimit } from "@/server/services/entitlement-service"
import { scanProjectUrl } from "@/server/services/project-scan-service"

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer, "Scoped MCP tokens cannot scan project URLs.")
  await consumeIpRateLimit(`user:${viewer.userId}`, "project_scan_url_minute", 10)

  const body = await request.json().catch(() => {
    throw new BadRequestError("Project URL is required.")
  }) as { url?: string }
  const result = await scanProjectUrl(body.url ?? "")
  return NextResponse.json(result)
})
