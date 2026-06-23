import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}))

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/auth/sign-in-animated", () => ({
  SignInAnimatedItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: ({ intent, nextPath }: { intent?: string; nextPath?: string }) => (
    <div data-testid="google-sign-in-button" data-intent={intent} data-next-path={nextPath} />
  ),
}))

vi.mock("@/components/auth/email-sign-in-form", () => ({
  EmailSignInForm: ({
    onModeChange,
  }: {
    onModeChange?: (mode: "sign-in" | "sign-up") => void
  }) => (
    <button type="button" onClick={() => onModeChange?.("sign-up")}>
      Switch mocked email form to sign up
    </button>
  ),
}))

vi.mock("@/components/auth/local-sign-in-form", () => ({
  LocalSignInForm: () => null,
}))

import { SignInAuthPanel } from "./sign-in-auth-panel"

describe("SignInAuthPanel", () => {
  it("passes the current panel mode to Google sign-in", () => {
    render(
      <SignInAuthPanel
        authConfigured
        googleAuthConfigured
        authProvider="neon"
        intent="sign-in"
        nextPath="/dashboard"
      />,
    )

    expect(screen.getByTestId("google-sign-in-button").getAttribute("data-intent")).toBe("sign-in")

    fireEvent.click(screen.getByRole("button", { name: "Switch mocked email form to sign up" }))

    expect(screen.getByText("Create your Relay account")).toBeTruthy()
    expect(screen.getByTestId("google-sign-in-button").getAttribute("data-intent")).toBe("sign-up")
  })
})
