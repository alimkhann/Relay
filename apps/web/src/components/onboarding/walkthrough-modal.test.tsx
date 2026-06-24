import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.fn()
const refresh = vi.fn()
const relayClientFetch = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: any) => <img alt={alt} {...props} />,
}))

vi.mock("motion/react", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const Tag = String(prop)
        return ({ children, ...props }: any) => {
          const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props
          return <Tag {...rest}>{children}</Tag>
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("@/components/chrome-webstore-badge", () => ({
  ChromeWebstoreBadge: () => <a href="https://chromewebstore.google.com">Add to Chrome</a>,
}))

vi.mock("@/components/billing/paywall-plan-cards", () => ({
  PaywallPlanCards: () => <div>Plan cards</div>,
}))

vi.mock("@/lib/telemetry/fetch", () => ({
  relayClientFetch: (...args: unknown[]) => relayClientFetch(...args),
}))

import { GUIDE_START_STEP, WalkthroughModal } from "./walkthrough-modal"

function renderOnboarding() {
  return render(
    <WalkthroughModal
      open
      onOpenChange={vi.fn()}
      surface="web"
      mode="onboarding"
    />,
  )
}

function advanceToProjectStep() {
  fireEvent.click(screen.getByRole("button", { name: /My AI & coding work/ }))
  fireEvent.click(screen.getByRole("button", { name: "ChatGPT" }))
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
}

describe("WalkthroughModal", () => {
  beforeEach(() => {
    push.mockClear()
    refresh.mockClear()
    relayClientFetch.mockReset()
    Object.defineProperty(window.HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    })
    relayClientFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ project: { id: "project-123" } }),
    })
  })

  it("starts dashboard guide mode on the first video step", () => {
    render(
      <WalkthroughModal
        open
        onOpenChange={vi.fn()}
        surface="web"
        mode="guide"
      />,
    )

    expect(GUIDE_START_STEP).toBe(3)
    expect(screen.getByText("Auto-capture")).toBeTruthy()
    expect(screen.queryByText("Add a project")).toBeNull()
  })

  it("places optional project creation before the video steps and allows skipping it", async () => {
    renderOnboarding()

    advanceToProjectStep()

    expect(screen.getByText("Add a project")).toBeTruthy()
    expect(screen.getByText(/Relay already created Personal/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }))

    expect(await screen.findByText("Auto-capture")).toBeTruthy()
  })

  it("creates a project from onboarding and continues", async () => {
    renderOnboarding()

    advanceToProjectStep()
    fireEvent.change(screen.getByPlaceholderText("E.g., Relay, school, client work"), {
      target: { value: "Relay" },
    })
    fireEvent.change(screen.getByPlaceholderText("A short boundary so Relay knows what belongs here."), {
      target: { value: "AI memory manager." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create project" }))

    await waitFor(() => {
      expect(relayClientFetch).toHaveBeenCalledWith(
        "/api/projects",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Relay",
            slug: "relay",
            description: "AI memory manager.",
            projectUrl: null,
          }),
        }),
      )
    })
    expect(push).toHaveBeenCalledWith("/dashboard?project=project-123")
    expect(refresh).toHaveBeenCalled()
    expect(await screen.findByText("Auto-capture")).toBeTruthy()
  })
})
