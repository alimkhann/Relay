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
        callbackURL: "/dashboard",
        newUserCallbackURL: "/dashboard",
        requestSignUp: true,
        disableRedirect: true
      })
    })

    expect(assignMock).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=relay&prompt=select_account"
    )
  })

  it("uses standard sign-in options outside signup intent", async () => {
    render(<GoogleSignInButton nextPath="/settings" intent="sign-in" />)

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))

    await waitFor(() => {
      expect(signInSocialMock).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/settings",
        newUserCallbackURL: "/settings",
        requestSignUp: false,
        disableRedirect: false
      })
    })
  })
})
