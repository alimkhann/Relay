import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import { withApiRoute } from "@/server/http/api-route"

export const GET = withApiRoute(async () => {
  const repositories = createRepositoryBundle()
  await repositories.provider.query("select 1")

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString()
  })
}, { logSuccess: false })
