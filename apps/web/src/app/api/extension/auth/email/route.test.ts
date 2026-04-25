import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  signUpEmailMock,
  signInEmailMock,
  sendVerificationOtpMock,
  verifyEmailMock,
  createExtensionTokenForUserMock,
} = vi.hoisted(() => ({
  signUpEmailMock: vi.fn(),
  signInEmailMock: vi.fn(),
  sendVerificationOtpMock: vi.fn(),
  verifyEmailMock: vi.fn(),
  createExtensionTokenForUserMock: vi.fn(),
}))

vi.mock("@/lib/auth/provider", () => ({
  getAuthProvider: () => "neon",
}))

vi.mock("@/lib/auth/server", () => ({
  requireAuthServer: () => ({
    signUp: { email: signUpEmailMock },
    signIn: { email: signInEmailMock },
    emailOtp: {
      sendVerificationOtp: sendVerificationOtpMock,
      verifyEmail: verifyEmailMock,
    },
  }),
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

import { POST } from "./route"

describe("POST /api/extension/auth/email", () => {
  beforeEach(() => {
    signUpEmailMock.mockReset()
    signInEmailMock.mockReset()
    sendVerificationOtpMock.mockReset()
    verifyEmailMock.mockReset()
    createExtensionTokenForUserMock.mockReset()
  })

  it("sends a signup OTP before issuing an extension token", async () => {
    signUpEmailMock.mockResolvedValue({ data: { user: { id: "user-1", email: "ada@example.com" } }, error: null })
    sendVerificationOtpMock.mockResolvedValue({ data: { success: true }, error: null })

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
    expect(sendVerificationOtpMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      type: "email-verification",
    })
    expect(createExtensionTokenForUserMock).not.toHaveBeenCalled()
  })

  it("verifies signup OTP before issuing an extension token", async () => {
    verifyEmailMock.mockResolvedValue({ data: { status: true }, error: null })
    signInEmailMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "ada@example.com" } },
      error: null,
    })
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
    expect(verifyEmailMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      otp: "123456",
    })
    expect(createExtensionTokenForUserMock).toHaveBeenCalledWith("user-1", {
      deviceName: "Chrome Extension",
    })
    expect(payload.token).toBe("relay-token")
  })
})
