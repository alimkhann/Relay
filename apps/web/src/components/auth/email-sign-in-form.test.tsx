import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  replaceMock,
  fetchMock,
  refreshMock,
  signInEmailMock,
  signUpEmailMock,
  sendVerificationOtpMock,
  verifyEmailMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  fetchMock: vi.fn(),
  refreshMock: vi.fn(),
  signInEmailMock: vi.fn(),
  signUpEmailMock: vi.fn(),
  sendVerificationOtpMock: vi.fn(),
  verifyEmailMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
}))

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    signIn: {
      email: signInEmailMock,
    },
    signUp: {
      email: signUpEmailMock,
    },
    emailOtp: {
      sendVerificationOtp: sendVerificationOtpMock,
      verifyEmail: verifyEmailMock,
    },
  },
}))

vi.mock("@/lib/telemetry/client", () => ({
  createClientFlowId: () => "flow-test",
  logClientEvent: vi.fn(),
}))

import { EmailSignInForm } from "./email-sign-in-form"

describe("EmailSignInForm", () => {
  beforeEach(() => {
    replaceMock.mockClear()
    fetchMock.mockReset()
    refreshMock.mockClear()
    signInEmailMock.mockReset()
    signUpEmailMock.mockReset()
    sendVerificationOtpMock.mockReset()
    verifyEmailMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  it("requires email OTP verification before redirecting after sign-up", async () => {
    signUpEmailMock.mockResolvedValue({ error: null })
    signInEmailMock.mockResolvedValue({ error: null })
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))

    render(<EmailSignInForm intent="sign-up" nextPath="/dashboard" />)

    fireEvent.change(screen.getByPlaceholderText("Your name"), {
      target: { value: "Ada Lovelace" },
    })
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "ada@example.com" },
    })
    fireEvent.change(screen.getByPlaceholderText("Create a password"), {
      target: { value: "password123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create account" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/email-otp",
        expect.objectContaining({
          body: JSON.stringify({ action: "send", email: "ada@example.com" }),
          method: "POST",
        }),
      )
    })
    expect(replaceMock).not.toHaveBeenCalled()
    expect(screen.getByText("Check your email")).toBeTruthy()

    const otpInputs = screen.getAllByRole("textbox")
    "123456".split("").forEach((digit, index) => {
      fireEvent.change(otpInputs[index]!, { target: { value: digit } })
    })
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/email-otp",
        expect.objectContaining({
          body: JSON.stringify({ action: "verify", email: "ada@example.com", otp: "123456" }),
          method: "POST",
        }),
      )
    })
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        "/dashboard?auth_callback=1&auth_method=email&auth_intent=sign-up"
      )
    })
    expect(refreshMock).toHaveBeenCalled()
  })
})
