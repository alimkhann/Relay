import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { redirectMock, getSessionMock, getAuthServerMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`)
  }),
  getSessionMock: vi.fn(),
  getAuthServerMock: vi.fn()
}))

getAuthServerMock.mockImplementation(() => ({
  getSession: getSessionMock
}))

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}))

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: getAuthServerMock
}))

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: any; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}))

vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: ({ intent, nextPath }: { intent?: string; nextPath?: string }) => (
    <div data-testid="google-sign-in-button" data-intent={intent} data-next-path={nextPath} />
  )
}))

vi.mock("@/components/telemetry/page-telemetry", () => ({
  PageTelemetry: () => null
}))

import SignInPage from "./page"

describe("SignInPage", () => {
  beforeEach(() => {
    redirectMock.mockClear()
    getSessionMock.mockReset()
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.com")
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "secret")
  })

  it("redirects authenticated users to the requested next path", async () => {
    getSessionMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "user-1"
        }
      }
    })

    await expect(
      SignInPage({
        searchParams: Promise.resolve({
          next: "/projects/project-1"
        })
      })
    ).rejects.toThrow("REDIRECT:/projects/project-1")
  })

  it("passes signup intent to the Google button", async () => {
    getSessionMock.mockResolvedValueOnce({ data: null })

    render(
      await SignInPage({
        searchParams: Promise.resolve({
          next: "/dashboard",
          intent: "sign-up"
        })
      })
    )

    expect(screen.getByText("Create your Relay account")).toBeTruthy()
    expect(screen.getByTestId("google-sign-in-button").getAttribute("data-intent")).toBe("sign-up")
    expect(screen.getByTestId("google-sign-in-button").getAttribute("data-next-path")).toBe("/dashboard")
  })
})
