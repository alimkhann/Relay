import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

import { createRepositoryBundle } from "@relay/db"
import { browserSessionHandoffStartSchema, hashContent } from "@relay/shared"

import { resolveSafeNextPath } from "@/server/policies/viewer"
import { resolveGoogleAuthUser } from "./google-auth-service"

const HANDOFF_TTL_MS = 10 * 60 * 1000

function buildHandoffToken() {
  return `relay_handoff_${randomBytes(24).toString("hex")}`
}

function getEncryptionKey() {
  const secret = process.env.RELAY_BROWSER_HANDOFF_SECRET ?? process.env.NEON_AUTH_COOKIE_SECRET

  if (!secret) {
    throw new Error("RELAY_BROWSER_HANDOFF_SECRET or NEON_AUTH_COOKIE_SECRET is required.")
  }

  return createHash("sha256").update(secret).digest()
}

function encryptSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

function decryptSecret(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".")
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Browser handoff token payload is malformed.")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ])

  return decrypted.toString("utf8")
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
  const repositories = createRepositoryBundle()
  const record = await repositories.browserSessionHandoffs.getValidByHash(hashContent(token))

  if (!record) {
    throw new Error("Browser session handoff is invalid or expired.")
  }

  await repositories.browserSessionHandoffs.consume(record.id)

  return {
    userId: record.userId,
    nextPath: resolveSafeNextPath(record.nextPath, "/dashboard"),
    googleAccessToken: decryptSecret(record.encryptedGoogleAccessToken),
    googleIdToken: decryptSecret(record.encryptedGoogleIdToken)
  }
}
