import { randomBytes } from "node:crypto"

import { createRepositoryBundle, createServiceRepositoryBundle } from "@relay/db"
import { browserSessionHandoffStartSchema, hashContent } from "@relay/shared"

import { resolveSafeNextPath } from "@/server/policies/viewer"
import { decryptSecret, encryptSecret } from "@/server/lib/secret-crypto"
import { resolveGoogleAuthUser } from "./google-auth-service"

const HANDOFF_TTL_MS = 10 * 60 * 1000

function buildHandoffToken() {
  return `relay_handoff_${randomBytes(24).toString("hex")}`
}

export async function startBrowserSessionHandoff(
  viewerUserId: string,
  input: unknown
) {
  const parsed = browserSessionHandoffStartSchema.parse(input)
  const { authUser } = await resolveGoogleAuthUser({
    googleAccessToken: parsed.googleAccessToken,
    googleIdToken: parsed.googleIdToken,
    allowProvisionFallback: true
  })

  if (authUser.id !== viewerUserId) {
    throw new Error("Google account does not match the current Relay session.")
  }

  const repositories = createRepositoryBundle(viewerUserId)
  const handoffToken = buildHandoffToken()
  const record = await repositories.browserSessionHandoffs.create({
    userId: viewerUserId,
    handoffHash: hashContent(handoffToken),
    handoffPrefix: handoffToken.slice(0, 18),
    encryptedGoogleAccessToken: encryptSecret(parsed.googleAccessToken),
    encryptedGoogleIdToken: encryptSecret(parsed.googleIdToken),
    nextPath: resolveSafeNextPath(parsed.nextPath, "/dashboard"),
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS).toISOString()
  })

  const appUrl = process.env.NEXT_PUBLIC_RELAY_APP_URL ?? "http://localhost:3000"
  const url = new URL("/auth/browser-handoff", appUrl)
  url.searchParams.set("token", handoffToken)

  return {
    url: url.toString(),
    expiresAt: record.expiresAt
  }
}

export async function consumeBrowserSessionHandoff(token: string) {
  const repositories = createServiceRepositoryBundle()
  const record = await repositories.browserSessionHandoffs.consumeValidByHash(hashContent(token))

  if (!record) {
    throw new Error("Browser session handoff is invalid or expired.")
  }

  return {
    userId: record.userId,
    nextPath: resolveSafeNextPath(record.nextPath, "/dashboard"),
    googleAccessToken: decryptSecret(record.encryptedGoogleAccessToken),
    googleIdToken: decryptSecret(record.encryptedGoogleIdToken)
  }
}
