import { randomBytes, randomInt } from "node:crypto"

import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import { hashContent } from "@relay/shared"

import { withApiRoute } from "@/server/http/api-route"

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-"
    code += chars[randomInt(chars.length)]
  }
  return code
}

export const POST = withApiRoute(async () => {
  const repositories = createRepositoryBundle()
  const sessionCode = generateSessionCode()
  const pollingSecret = `relay_cli_${randomBytes(16).toString("hex")}`
  const sessionHash = hashContent(pollingSecret)
  const sessionPrefix = pollingSecret.slice(0, 16)

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  await repositories.cliAuthSessions.create({
    sessionCode,
    sessionHash,
    sessionPrefix,
    deviceName: "CLI",
    expiresAt
  })

  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "https://relay-flow.vercel.app"

  return NextResponse.json({
    pollingSecret,
    sessionCode,
    expiresAt,
    appUrl
  })
})
