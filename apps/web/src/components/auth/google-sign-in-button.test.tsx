import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { signInSocialMock, logClientEventMock } = vi.hoisted(() => ({
  signInSocialMock: vi.fn(async () => ({
    data: {
      redirect: true,
      url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=relay"
    }
  })),
  logClientEventMock: vi.fn()
}))

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    signIn: {
      social: signInSocialMock
    }
  }
}))

vi.mock("@/lib/telemetry/client", () => ({
  createClientFlowId: () => "flow-1",
  logClientEvent: logClientEventMock
}))

import { GoogleSignInButton } from "./google-sign-in-button"

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    signInSocialMock.mockClear()
    logClientEventMock.mockClear()
    vi.restoreAllMocks()
  })

  it("requests signup flow options when intent is sign-up", async () => {
    const assignMock = vi.fn()
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignMock
    })

    render(<GoogleSignInButton nextPath="/dashboard" intent="sign-up" />)

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))

    await waitFor(() => {
      expect(signInSocialMock).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/dashboard?auth_callback=1&auth_method=google&auth_intent=sign-up",
        newUserCallbackURL: "/dashboard?auth_callback=1&auth_method=google&auth_intent=sign-up",
        requestSignUp: true,
        disableRedirect: true
      })
    })

    expect(assignMock).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=relay&prompt=select_account"
    )
  })

  it("uses standard sign-in options outside signup intent", async () => {
    const assignMock = vi.fn()
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignMock
    })

    render(<GoogleSignInButton nextPath="/settings" intent="sign-in" />)

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))

    await waitFor(() => {
      expect(signInSocialMock).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/settings?auth_callback=1&auth_method=google&auth_intent=sign-in",
        newUserCallbackURL: "/settings?auth_callback=1&auth_method=google&auth_intent=sign-in",
        requestSignUp: false,
        disableRedirect: true
      })
    })

    expect(assignMock).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=relay&prompt=select_account"
    )
  })

  it("ignores repeat clicks while the Google redirect is being prepared", async () => {
    let resolveSignIn!: (value: { data: { redirect: boolean; url: string } }) => void
    signInSocialMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve
        }),
    )
    const assignMock = vi.fn()
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignMock
    })

    render(<GoogleSignInButton nextPath="/dashboard" intent="sign-in" />)

    const button = screen.getByRole("button", { name: "Continue with Google" })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => {
      expect(signInSocialMock).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByRole("button", { name: "Opening Google…" }).hasAttribute("disabled")).toBe(true)

    resolveSignIn({
      data: {
        redirect: true,
        url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=relay",
      },
    })

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=relay&prompt=select_account"
      )
    })
  })

  it("logs when the browser is handed to Google's OAuth URL", async () => {
    const assignMock = vi.fn()
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign: assignMock
    })

    render(<GoogleSignInButton nextPath="/dashboard" intent="sign-in" />)

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))

    await waitFor(() => {
      expect(logClientEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "google_sign_in.redirecting",
          flowId: "flow-1",
        }),
      )
    })
  })
})
