import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  createExtensionTokenForUserMock,
  dbQueryMock,
  sendEmailVerificationOtpMock,
} = vi.hoisted(() => ({
  createExtensionTokenForUserMock: vi.fn(),
  dbQueryMock: vi.fn(),
  sendEmailVerificationOtpMock: vi.fn(),
}))

vi.mock("@/lib/auth/provider", () => ({
  getAuthProvider: () => "neon",
}))

vi.mock("@relay/db", () => ({
  createRepositoryProvider: () => ({ query: dbQueryMock }),
}))

vi.mock("@/server/http/extension-cors", () => ({
  applyExtensionCorsHeaders: (response: Response) => response,
  buildExtensionPreflightResponse: () => new Response(null, { status: 204 }),
}))

vi.mock("@/server/logging/logger", () => ({
  logServerEvent: vi.fn(),
}))

vi.mock("@/server/logging/request-context", () => ({
  getRequestContext: () => ({ requestId: "req-test", flowId: "flow-test" }),
  withRequestContext: (_request: Request, handler: () => Promise<Response>) => handler(),
}))

vi.mock("@/server/services/rate-limit-service", () => ({
  assertIpRateLimit: vi.fn(),
}))

vi.mock("@/server/services/google-auth-service", () => ({
  extractAuthUser: (user: unknown) => user,
}))

vi.mock("@/server/services/auth-sync-service", () => ({
  reconcileProfileForAuthUser: vi.fn(),
}))

vi.mock("@/server/services/onboarding-service", () => ({
  getResolvedOnboardingStateForUser: vi.fn(async () => ({ status: "pending" })),
}))

vi.mock("@/server/services/project-service", () => ({
  listProjectsForUser: vi.fn(async () => []),
}))

vi.mock("@/server/services/settings-service", () => ({
  getUserSettings: vi.fn(async () => ({
    settings: { defaultTargetProfileKey: "chatgpt_planning" },
  })),
}))

vi.mock("@/server/services/extension-token-service", () => ({
  createExtensionTokenForUser: createExtensionTokenForUserMock,
}))

vi.mock("@/server/services/email-service", () => ({
  sendEmailVerificationOtp: sendEmailVerificationOtpMock,
}))

import { POST } from "./route"

const NEON_AUTH_USER = { id: "user-1", email: "ada@example.com", name: "Ada" }

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  )
}

describe("POST /api/extension/auth/email", () => {
  beforeEach(() => {
    createExtensionTokenForUserMock.mockReset()
    dbQueryMock.mockReset()
    sendEmailVerificationOtpMock.mockReset()
    vi.restoreAllMocks()
    process.env.NEON_AUTH_BASE_URL = "https://neonauth.test/auth"
    process.env.NEXT_PUBLIC_RELAY_APP_URL = "https://app.test"
  })

  it("sends a signup OTP before creating account", async () => {
    dbQueryMock.mockResolvedValue([])
    sendEmailVerificationOtpMock.mockResolvedValue(undefined)

    const response = await POST(
      new Request("http://relay.test/api/extension/auth/email", {
        method: "POST",
        body: JSON.stringify({
          email: "ada@example.com",
          password: "password123",
          name: "Ada",
          intent: "sign-up",
          deviceName: "Chrome Extension",
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(202)
    expect(payload.requiresOtp).toBe(true)
    expect(dbQueryMock).toHaveBeenCalledWith(expect.stringContaining("email_otp_tokens"), expect.any(Array))
    expect(sendEmailVerificationOtpMock).toHaveBeenCalledWith("ada@example.com", expect.any(String))
    expect(createExtensionTokenForUserMock).not.toHaveBeenCalled()
  })

  it("verifies signup OTP then creates account via NeonAuth direct fetch", async () => {
    // OTP verify query returns a matching row
    dbQueryMock
      .mockResolvedValueOnce([{ email: "ada@example.com" }]) // SELECT
      .mockResolvedValueOnce([])                              // UPDATE used_at

    mockFetch({ user: NEON_AUTH_USER, token: "session-token" }, 200)
    createExtensionTokenForUserMock.mockResolvedValue({ token: "relay-token" })

    const response = await POST(
      new Request("http://relay.test/api/extension/auth/email", {
        method: "POST",
        body: JSON.stringify({
          email: "ada@example.com",
          password: "password123",
          intent: "sign-up",
          otp: "123456",
          deviceName: "Chrome Extension",
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    const fetchCall = vi.mocked(fetch).mock.calls[0]
    expect(fetchCall[0]).toContain("sign-up/email")
    expect((fetchCall[1]?.headers as Record<string, string>)?.["Origin"]).toBe("https://app.test")
    expect(createExtensionTokenForUserMock).toHaveBeenCalledWith("user-1", { deviceName: "Chrome Extension" })
    expect(payload.token).toBe("relay-token")
  })

  it("signs in via NeonAuth direct fetch with app origin (not extension origin)", async () => {
    mockFetch({ user: NEON_AUTH_USER, token: "session-token" }, 200)
    createExtensionTokenForUserMock.mockResolvedValue({ token: "relay-token" })

    const response = await POST(
      new Request("http://relay.test/api/extension/auth/email", {
        method: "POST",
        headers: { origin: "chrome-extension://abc123" },
        body: JSON.stringify({
          email: "ada@example.com",
          password: "password123",
          intent: "sign-in",
          deviceName: "Chrome Extension",
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    const fetchCall = vi.mocked(fetch).mock.calls[0]
    expect(fetchCall[0]).toContain("sign-in/email")
    // Must NOT forward the chrome-extension:// origin to NeonAuth
    expect((fetchCall[1]?.headers as Record<string, string>)?.["Origin"]).toBe("https://app.test")
    expect((fetchCall[1]?.headers as Record<string, string>)?.["Origin"]).not.toContain("chrome-extension")
    expect(payload.token).toBe("relay-token")
  })

  it("rejects invalid OTP on sign-up", async () => {
    dbQueryMock.mockResolvedValueOnce([]) // SELECT returns no rows

    const response = await POST(
      new Request("http://relay.test/api/extension/auth/email", {
        method: "POST",
        body: JSON.stringify({
          email: "ada@example.com",
          password: "password123",
          intent: "sign-up",
          otp: "000000",
        }),
      })
    )

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toMatch(/invalid|expired/i)
    expect(createExtensionTokenForUserMock).not.toHaveBeenCalled()
  })

  it("returns 401 when NeonAuth rejects credentials", async () => {
    mockFetch({ message: "Invalid email or password" }, 401)

    const response = await POST(
      new Request("http://relay.test/api/extension/auth/email", {
        method: "POST",
        body: JSON.stringify({
          email: "ada@example.com",
          password: "wrong",
          intent: "sign-in",
        }),
      })
    )

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toMatch(/Invalid email or password/i)
  })
})
