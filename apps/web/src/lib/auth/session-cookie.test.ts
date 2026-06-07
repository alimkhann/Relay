import { beforeEach, describe, expect, it, vi } from "vitest"

const cookieState = vi.hoisted(() => new Map<string, string>())
const headerState = vi.hoisted(() => new Map<string, string>())

const { cookiesMock, headersMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(async () => ({
    get(name: string) {
      const value = cookieState.get(name)
      return value ? { name, value } : undefined
    }
  })),
  headersMock: vi.fn(async () => ({
    get(name: string) {
      return headerState.get(name.toLowerCase()) ?? null
    }
  }))
}))

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
  headers: headersMock
}))

import { clearAuthCacheForTests, readSessionUserFromCookie } from "./session-cookie"

const SESSION_DATA_COOKIE_NAME = "__Secure-neon-auth.local.session_data"
const SESSION_TOKEN_COOKIE_NAME = "__Secure-neon-auth.session_token"
const COOKIE_SECRET = "12345678901234567890123456789012"

async function signSessionCookie(payload: Record<string, unknown>) {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")
  const now = Math.floor(Date.now() / 1000)
  const encodedHeader = encode({ alg: "HS256", typ: "JWT" })
  const encodedPayload = encode({
    ...payload,
    iat: now,
    exp: now + 300
  })
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(COOKIE_SECRET),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  )
  const encodedSignature = Buffer.from(signature)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`
}

describe("readSessionUserFromCookie", () => {
  beforeEach(() => {
    cookieState.clear()
    headerState.clear()
    cookiesMock.mockClear()
    headersMock.mockClear()
    clearAuthCacheForTests()
    vi.unstubAllEnvs()
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", COOKIE_SECRET)
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.com")
    vi.unstubAllGlobals()
  })

  it("reads the signed session-data cookie without fetching", async () => {
    cookieState.set(SESSION_TOKEN_COOKIE_NAME, "session-token")
    cookieState.set(
      SESSION_DATA_COOKIE_NAME,
      await signSessionCookie({
        user: {
          id: "user-1",
          email: "user@example.com",
          name: "Relay User",
          image: "https://example.com/avatar.png"
        }
      })
    )
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(readSessionUserFromCookie()).resolves.toEqual({
      id: "user-1",
      email: "user@example.com",
      name: "Relay User",
      image: "https://example.com/avatar.png"
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("falls back to the auth server when the cached cookie is missing", async () => {
    cookieState.set(SESSION_TOKEN_COOKIE_NAME, "session-token")
    headerState.set("host", "onrelay.app")
    const fetchMock = vi.fn(async () =>
      Response.json({
        user: {
          id: "user-2",
          email: "user2@example.com",
          name: "Relay Two",
          image: null
        }
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(readSessionUserFromCookie()).resolves.toEqual({
      id: "user-2",
      email: "user2@example.com",
      name: "Relay Two",
      image: null
    })
    expect(fetchMock).toHaveBeenCalledWith(new URL("get-session", "https://auth.example.com"), {
      method: "GET",
      headers: expect.any(Headers),
      cache: "no-store"
    })
  })

  it("accepts a Neon Google session cookie as a fallback in local auth mode", async () => {
    vi.stubEnv("AUTH_PROVIDER", "local")
    cookieState.set(SESSION_TOKEN_COOKIE_NAME, "session-token")
    cookieState.set(
      SESSION_DATA_COOKIE_NAME,
      await signSessionCookie({
        user: {
          id: "google-user-1",
          email: "google@example.com",
          name: "Google User",
          image: null
        }
      })
    )

    await expect(readSessionUserFromCookie()).resolves.toEqual({
      id: "google-user-1",
      email: "google@example.com",
      name: "Google User",
      image: null
    })
  })

  it("returns null when there is no session token cookie", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(readSessionUserFromCookie()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
