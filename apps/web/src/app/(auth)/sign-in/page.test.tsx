import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { redirectMock, resolveOptionalViewerMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`)
  }),
  resolveOptionalViewerMock: vi.fn(async () => null)
}))

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({
    replace: vi.fn()
  })
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

vi.mock("@/server/policies/viewer", () => ({
  resolveAuthenticatedAppPath: (v: string | null | undefined) =>
    v && v.startsWith("/") ? v : "/dashboard",
  resolveOptionalViewer: resolveOptionalViewerMock,
  resolveSafeNextPath: (value: string | null | undefined, fallback = "/dashboard") =>
    value && value.startsWith("/") ? value : fallback,
  resolveWebAuthIntent: (value: string | null | undefined) => (value === "sign-up" ? "sign-up" : "sign-in")
}))

import SignInPage from "./page"

describe("SignInPage", () => {
  beforeEach(() => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.com")
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "secret")
    redirectMock.mockClear()
    resolveOptionalViewerMock.mockReset()
    resolveOptionalViewerMock.mockResolvedValue(null)
  })

  it("passes nextPath to Google sign-in button", async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({
          next: "/projects/project-1",
        })
      })
    )

    expect(screen.getByTestId("google-sign-in-button").getAttribute("data-next-path")).toBe(
      "/projects/project-1"
    )
  })

  it("passes signup intent to the Google button", async () => {
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

  it("redirects authenticated visitors to the next path", async () => {
    resolveOptionalViewerMock.mockResolvedValueOnce({
      userId: "user-1",
      mode: "session"
    } as any)

    await expect(
      SignInPage({
        searchParams: Promise.resolve({
          next: "/wizard-onboarding?code=TEST",
          intent: "sign-in"
        })
      })
    ).rejects.toThrow("REDIRECT:/wizard-onboarding?code=TEST")
  })
})
