import { NextResponse } from "next/server"

import { drainDigestJobs } from "@/server/services/digest-service"

export async function POST(request: Request) {
  const secret = process.env.RELAY_INTERNAL_API_SECRET
  const provided = request.headers.get("x-relay-internal-secret")

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { userId?: string; limit?: number }
  if (!body.userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 })
  }

  await drainDigestJobs(body.userId, body.limit ?? 4)
  return NextResponse.json({ ok: true })
}
