import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ENCRYPTED_PREFIX = "enc::"

let encryptionFallbackWarned = false

function getEncryptionKey() {
  const primary = process.env.RELAY_CONTENT_ENCRYPTION_KEY
  if (primary) {
    return createHash("sha256").update(primary).digest()
  }

  const fallback = process.env.RELAY_BROWSER_HANDOFF_SECRET ?? process.env.NEON_AUTH_COOKIE_SECRET
  if (!fallback) {
    return null
  }

  if (!encryptionFallbackWarned) {
    encryptionFallbackWarned = true
    console.warn("[encrypted-text] Using fallback secret for encryption. Set RELAY_CONTENT_ENCRYPTION_KEY in production.")
  }

  return createHash("sha256").update(fallback).digest()
}

export function encryptTextIfConfigured(value: string) {
  const key = getEncryptionKey()
  if (!key) {
    return value
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${ENCRYPTED_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export function decryptTextIfNeeded(value: string) {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }

  const key = getEncryptionKey()
  if (!key) {
    throw new Error("Encrypted Relay content cannot be read without RELAY_CONTENT_ENCRYPTION_KEY or fallback secret.")
  }

  const [ivRaw, tagRaw, encryptedRaw] = value.slice(ENCRYPTED_PREFIX.length).split(".")
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Encrypted Relay content payload is malformed.")
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"))
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ])

  return decrypted.toString("utf8")
}

/**
 * Decrypts and parses a value that may be:
 * - An encrypted string ("enc::...") → decrypt then JSON.parse
 * - A plain JSON string ("[]", "{...}") → JSON.parse (columns converted from jsonb to text)
 * - An already-parsed object/array → return as-is
 */
export function decryptJsonbIfNeeded(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith(ENCRYPTED_PREFIX)) {
      return JSON.parse(decryptTextIfNeeded(value))
    }
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}
