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
  it("shows feedback directly in the sidebar alongside usage and referral widgets", () => {
    render(
      <Sidebar
        currentProjectId="project-1"
        projects={[{ id: "project-1", name: "Relay" }]}
        user={{ name: "Relay User", email: "user@example.com" }}
        referral={{ code: "REF123", link: "https://relay.test/r/REF123", qualifiedCount: 2 }}
        plan={{ plan: "free", isPaid: false, capturesUsed: 12, capturesLimit: 100 }}
      />,
    )

    expect(screen.getByText("Referrals")).toBeTruthy()
    expect(screen.getByText("Captures")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Feedback" })).toBeTruthy()
  })
})
