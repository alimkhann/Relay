import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  replaceMock,
  refreshMock,
  signInEmailMock,
  signUpEmailMock,
  sendVerificationOtpMock,
  verifyEmailMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
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
    refreshMock.mockClear()
    signInEmailMock.mockReset()
    signUpEmailMock.mockReset()
    sendVerificationOtpMock.mockReset()
    verifyEmailMock.mockReset()
  })

  it("requires email OTP verification before redirecting after sign-up", async () => {
    signUpEmailMock.mockResolvedValue({ error: null })
    sendVerificationOtpMock.mockResolvedValue({ error: null })
    verifyEmailMock.mockResolvedValue({ error: null })

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
      expect(sendVerificationOtpMock).toHaveBeenCalledWith({
        email: "ada@example.com",
        type: "email-verification",
      })
    })
    expect(replaceMock).not.toHaveBeenCalled()
    expect(screen.getByText("Verification code")).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText("Enter the code from your email"), {
      target: { value: "123456" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }))

    await waitFor(() => {
      expect(verifyEmailMock).toHaveBeenCalledWith({
        email: "ada@example.com",
        otp: "123456",
      })
    })
    expect(replaceMock).toHaveBeenCalledWith(
      "/dashboard?auth_callback=1&auth_method=email&auth_intent=sign-up"
    )
    expect(refreshMock).toHaveBeenCalled()
  })
})
