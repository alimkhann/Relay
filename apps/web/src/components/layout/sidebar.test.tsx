import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}))

vi.mock("@/components/layout/sidebar-context", () => ({
  useSidebar: () => ({
    collapsed: false,
    toggle: vi.fn(),
    mobileOpen: false,
    setMobileOpen: vi.fn(),
  }),
}))

vi.mock("@/components/layout/sidebar-nav", () => ({
  SidebarNav: () => <div>SidebarNav</div>,
}))

vi.mock("@/components/layout/sidebar-project-switcher", () => ({
  SidebarProjectSwitcher: () => <div>SidebarProjectSwitcher</div>,
}))

import { Sidebar } from "./sidebar"

describe("Sidebar", () => {
  it("keeps referral above the footer area and usage between feedback and account", () => {
    render(
      <Sidebar
        currentProjectId="project-1"
        projects={[{ id: "project-1", name: "Relay" }]}
        user={{ name: "Relay User", email: "user@example.com" }}
        referral={{ code: "REF123", link: "https://relay.test/r/REF123", qualifiedCount: 2 }}
        plan={{ plan: "free", isPaid: false, capturesUsed: 12, capturesLimit: 100 }}
      />,
    )

    const referral = screen.getByText("Referrals")
    const feedback = screen.getByRole("link", { name: "Feedback" })
    const captures = screen.getByText("Captures")
    const account = screen.getByText("Relay User")
    const upgrade = screen.getByRole("link", { name: "Upgrade" })

    expect(referral.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(feedback.compareDocumentPosition(captures) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(captures.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(upgrade).toBeTruthy()
  })

  it("shows an upgrade call-to-action for starter accounts when usage is approaching limits", () => {
    render(
      <Sidebar
        currentProjectId="project-1"
        projects={[{ id: "project-1", name: "Relay" }]}
        user={{ name: "Relay User", email: "user@example.com" }}
        referral={{ code: "REF123", link: "https://relay.test/r/REF123", qualifiedCount: 2 }}
        plan={{ plan: "starter", isPaid: true, capturesUsed: 75, capturesLimit: 100 }}
      />,
    )

    expect(screen.getByRole("link", { name: "Upgrade" })).toBeTruthy()
  })
})
