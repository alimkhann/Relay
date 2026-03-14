import { createHmac, timingSafeEqual } from "node:crypto"

import { cookies } from "next/headers"
import type { NextResponse } from "next/server"

export interface LocalSessionUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

export const LOCAL_SESSION_COOKIE_NAME = "relay.local_session"
const LOCAL_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

function getLocalSessionSecret() {
  const configuredSecret = process.env.LOCAL_AUTH_SESSION_SECRET

  if (configuredSecret) {
    return configuredSecret
  }

  if (process.env.NODE_ENV !== "production") {
    return "relay-local-development-session-secret"
  }

  throw new Error("LOCAL_AUTH_SESSION_SECRET is required when AUTH_PROVIDER=local.")
}

function encodeBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, "base64")
}

function sign(unsignedValue: string, secret: string) {
  return createHmac("sha256", secret).update(unsignedValue).digest()
}

function extractLocalSessionUser(payload: unknown): LocalSessionUser | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const candidate = "user" in payload ? (payload as { user?: unknown }).user : payload
  if (!candidate || typeof candidate !== "object") {
    return null
  }

  const user = candidate as Record<string, unknown>
  if (typeof user.id !== "string" || user.id.length === 0) {
    return null
  }

  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : null,
    name: typeof user.name === "string" ? user.name : null,
    image: typeof user.image === "string" ? user.image : null,
  }
}

export function createLocalSessionCookieValue(user: LocalSessionUser, expiresAt = Date.now() + LOCAL_SESSION_TTL_SECONDS * 1000) {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payload = encodeBase64Url(
    JSON.stringify({
      user,
      exp: Math.floor(expiresAt / 1000),
    })
  )
  const unsignedValue = `${header}.${payload}`
  const signature = encodeBase64Url(sign(unsignedValue, getLocalSessionSecret()))
  return `${unsignedValue}.${signature}`
}

export function parseLocalSessionCookieValue(value: string | null | undefined): LocalSessionUser | null {
  if (!value) {
    return null
  }

  try {
    const [encodedHeader, encodedPayload, encodedSignature] = value.split(".")
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return null
    }

    const header = JSON.parse(decodeBase64Url(encodedHeader).toString("utf8")) as { alg?: string }
    if (header.alg !== "HS256") {
      return null
    }

    const unsignedValue = `${encodedHeader}.${encodedPayload}`
    const expectedSignature = sign(unsignedValue, getLocalSessionSecret())
    const receivedSignature = decodeBase64Url(encodedSignature)

    if (
      expectedSignature.length !== receivedSignature.length ||
      !timingSafeEqual(expectedSignature, receivedSignature)
    ) {
      return null
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as {
      exp?: number
      user?: unknown
    }

    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
      return null
    }

    return extractLocalSessionUser(payload)
  } catch {
    return null
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOCAL_SESSION_TTL_SECONDS,
  }
}

export async function readLocalSessionUserFromCookie() {
  const cookieStore = await cookies()
  return parseLocalSessionCookieValue(cookieStore.get(LOCAL_SESSION_COOKIE_NAME)?.value)
}

export function applyLocalSessionCookie(response: NextResponse, user: LocalSessionUser) {
  response.cookies.set(LOCAL_SESSION_COOKIE_NAME, createLocalSessionCookieValue(user), cookieOptions())
  return response
}

export function clearLocalSessionCookieFromResponse(response: NextResponse) {
  response.cookies.set(LOCAL_SESSION_COOKIE_NAME, "", {
    ...cookieOptions(),
    maxAge: 0,
  })
  return response
}

export async function clearLocalSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.set(LOCAL_SESSION_COOKIE_NAME, "", {
    ...cookieOptions(),
    maxAge: 0,
  })
}
