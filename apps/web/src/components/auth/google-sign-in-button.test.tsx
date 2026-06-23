import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { logClientEventMock } = vi.hoisted(() => ({
  logClientEventMock: vi.fn()
}))

vi.mock("@/lib/telemetry/client", () => ({
  createClientFlowId: () => "flow-1",
  logClientEvent: logClientEventMock
}))

import { GoogleSignInButton } from "./google-sign-in-button"

function mockLocationAssign() {
  const assignMock = vi.fn()
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    assign: assignMock,
    origin: "https://www.onrelay.app",
  })
  return assignMock
}

function expectAssignedStartUrl(assignMock: ReturnType<typeof vi.fn>, input: {
  next: string
  intent: string
}) {
  expect(assignMock).toHaveBeenCalledTimes(1)
  const assigned = new URL(String(assignMock.mock.calls[0]?.[0]))
  expect(assigned.origin).toBe("https://www.onrelay.app")
  expect(assigned.pathname).toBe("/api/auth/google/start")
  expect(assigned.searchParams.get("next")).toBe(input.next)
  expect(assigned.searchParams.get("intent")).toBe(input.intent)
}

describe("GoogleSignInButton", () => {
  beforeEach(() => {
    logClientEventMock.mockClear()
    vi.restoreAllMocks()
  })

  it("starts the Relay-owned Google auth flow when intent is sign-up", async () => {
    const assignMock = mockLocationAssign()

    render(<GoogleSignInButton nextPath="/dashboard" intent="sign-up" />)

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))

    expectAssignedStartUrl(assignMock, {
      next: "/dashboard?auth_callback=1&auth_method=google&auth_intent=sign-up",
      intent: "sign-up",
    })
  })

  it("starts the Relay-owned Google auth flow outside signup intent", async () => {
    const assignMock = mockLocationAssign()

    render(<GoogleSignInButton nextPath="/settings" intent="sign-in" />)

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }))

    expectAssignedStartUrl(assignMock, {
      next: "/settings?auth_callback=1&auth_method=google&auth_intent=sign-in",
      intent: "sign-in",
    })
  })

  it("ignores repeat clicks while the Google redirect is being prepared", async () => {
    const assignMock = mockLocationAssign()

    render(<GoogleSignInButton nextPath="/dashboard" intent="sign-in" />)

    const button = screen.getByRole("button", { name: "Continue with Google" })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)

    expect(screen.getByRole("button", { name: "Opening Google…" }).hasAttribute("disabled")).toBe(true)
    expectAssignedStartUrl(assignMock, {
      next: "/dashboard?auth_callback=1&auth_method=google&auth_intent=sign-in",
      intent: "sign-in",
    })
  })

  it("logs when the browser is handed to Google's OAuth URL", async () => {
    mockLocationAssign()

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
