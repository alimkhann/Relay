import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import { withApiRoute } from "@/server/http/api-route"

function hasDeepHealthAccess(request: Request) {
  const secret = (process.env.RELAY_INTERNAL_API_SECRET ?? process.env.CRON_SECRET)?.trim()
  if (!secret) return false

  const internalSecret = request.headers.get("x-relay-internal-secret")?.trim()
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  return internalSecret === secret || bearer === secret
}

export const GET = withApiRoute(async (request: Request) => {
  const url = new URL(request.url)
  const deep = url.searchParams.get("deep") === "1" || url.searchParams.get("check") === "db"

  if (!deep) {
    return NextResponse.json({
      status: "ok",
      checks: {
        app: "ok",
      },
      timestamp: new Date().toISOString()
    })
  }

  if (!hasDeepHealthAccess(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const repositories = createRepositoryBundle()
  await repositories.provider.query("select 1")
  return NextResponse.json({
    status: "ok",
    checks: {
      app: "ok",
      database: "ok",
    },
    timestamp: new Date().toISOString()
  })
}, { logSuccess: false })
