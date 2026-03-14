import { cookies, headers } from "next/headers"

const NEON_AUTH_COOKIE_PREFIX = "__Secure-neon-auth"
const SESSION_DATA_COOKIE_NAME = `${NEON_AUTH_COOKIE_PREFIX}.local.session_data`
const SESSION_TOKEN_COOKIE_NAME = `${NEON_AUTH_COOKIE_PREFIX}.session_token`

export interface SessionCookieUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function extractSessionUser(payload: unknown): SessionCookieUser | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const candidate = "user" in payload ? (payload as { user?: unknown }).user : payload

  if (!candidate || typeof candidate !== "object") {
    return null
  }

  const user = candidate as Record<string, unknown>
  const id = readOptionalString(user.id)

  if (!id) {
    return null
  }

  return {
    id,
    email: readOptionalString(user.email),
    name: readOptionalString(user.name),
    image: readOptionalString(user.image)
  }
}

async function verifySessionDataCookie(
  sessionDataCookie: string,
  secret: string
): Promise<SessionCookieUser | null> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = sessionDataCookie.split(".")

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return null
    }

    const header = JSON.parse(
      Buffer.from(encodedHeader.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as { alg?: string }

    if (header.alg !== "HS256") {
      return null
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    )
    const signature = Buffer.from(
      encodedSignature.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    )
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    )

    if (!isValid) {
      return null
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as { exp?: number }

    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
      return null
    }

    return extractSessionUser(payload)
  } catch {
    return null
  }
}

async function fetchSessionUserFromAuthServer(
  sessionToken: string,
  baseUrl: string
): Promise<SessionCookieUser | null> {
  const headerStore = await headers()
  const refererOrigin = headerStore.get("referer")?.split("/").slice(0, 3).join("/") ?? null
  const forwardedHost = headerStore.get("x-forwarded-host") ?? headerStore.get("host")
  const forwardedProto = headerStore.get("x-forwarded-proto") ?? "https"
  const origin = headerStore.get("origin") ?? refererOrigin ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : null)
  const requestHeaders = new Headers({
    Cookie: `${SESSION_TOKEN_COOKIE_NAME}=${sessionToken}`
  })

  if (origin) {
    requestHeaders.set("Origin", origin)
  }

  const response = await fetch(new URL("get-session", baseUrl), {
    method: "GET",
    headers: requestHeaders,
    cache: "no-store"
  })

  if (!response.ok) {
    return null
  }

  const payload = await response.json().catch(() => null)
  return extractSessionUser(payload)
}

export async function readSessionUserFromCookie(): Promise<SessionCookieUser | null> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_TOKEN_COOKIE_NAME)?.value

  if (!sessionToken) {
    return null
  }

  const secret = process.env.NEON_AUTH_COOKIE_SECRET

  if (!secret) {
    return null
  }

  const sessionDataCookie = cookieStore.get(SESSION_DATA_COOKIE_NAME)?.value

  if (sessionDataCookie) {
    const cachedUser = await verifySessionDataCookie(sessionDataCookie, secret)

    if (cachedUser) {
      return cachedUser
    }
  }

  const baseUrl = process.env.NEON_AUTH_BASE_URL

  if (!baseUrl) {
    return null
  }

  return fetchSessionUserFromAuthServer(sessionToken, baseUrl)
}
