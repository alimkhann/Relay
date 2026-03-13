import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
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

vi.mock("@/components/auth/sign-in-session-gate", () => ({
  SignInSessionGate: ({
    nextPath,
    allowExistingSession,
  }: {
    nextPath: string
    allowExistingSession?: boolean
  }) => (
    <div
      data-testid="sign-in-session-gate"
      data-next-path={nextPath}
      data-allow-existing-session={String(Boolean(allowExistingSession))}
    />
  )
}))

vi.mock("@/components/telemetry/page-telemetry", () => ({
  PageTelemetry: () => null
}))

vi.mock("@/server/policies/viewer", () => ({
  resolveSafeNextPath: (value: string | null | undefined, fallback = "/dashboard") =>
    value && value.startsWith("/") ? value : fallback,
  resolveWebAuthIntent: (value: string | null | undefined) => (value === "sign-up" ? "sign-up" : "sign-in")
}))

import SignInPage from "./page"

describe("SignInPage", () => {
  beforeEach(() => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.com")
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "secret")
  })

  it("passes the requested next path to the session gate", async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({
          next: "/projects/project-1",
        })
      })
    )

    expect(screen.getByTestId("sign-in-session-gate").getAttribute("data-next-path")).toBe(
      "/projects/project-1"
    )
    expect(
      screen
        .getByTestId("sign-in-session-gate")
        .getAttribute("data-allow-existing-session"),
    ).toBe("true")
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
    expect(
      screen
        .getByTestId("sign-in-session-gate")
        .getAttribute("data-allow-existing-session"),
    ).toBe("false")
  })
})
