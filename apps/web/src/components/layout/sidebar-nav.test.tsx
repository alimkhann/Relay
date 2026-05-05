import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prefetchMock } = vi.hoisted(() => ({
  prefetchMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    prefetch: prefetchMock,
    push: vi.fn(),
  }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { SidebarNav } from "./sidebar-nav"

describe("SidebarNav", () => {
  beforeEach(() => {
    prefetchMock.mockClear()
  })

  it("renders all nav items", () => {
    render(<SidebarNav currentProjectId="project-1" />)

    expect(screen.getByText("Overview")).toBeTruthy()
    expect(screen.getByText("Memory")).toBeTruthy()
    expect(screen.getByText("Graph")).toBeTruthy()
    expect(screen.getByText("Brief")).toBeTruthy()
    expect(screen.getByText("Activity")).toBeTruthy()
  })

  it("disables project-dependent items when no project is selected", () => {
    render(<SidebarNav />)

    const memoryEl = screen.getByText("Memory").closest("[aria-disabled]")
    expect(memoryEl).toBeTruthy()
    expect(memoryEl?.getAttribute("aria-disabled")).toBe("true")

    const graphEl = screen.getByText("Graph").closest("[aria-disabled]")
    expect(graphEl).toBeTruthy()
    expect(graphEl?.getAttribute("aria-disabled")).toBe("true")
  })

  it("renders links with correct hrefs when project is selected", () => {
    render(<SidebarNav currentProjectId="project-1" />)

    const overviewLink = screen.getByText("Overview").closest("a")
    expect(overviewLink?.getAttribute("href")).toBe("/dashboard?project=project-1")

    const memoryLink = screen.getByText("Memory").closest("a")
    expect(memoryLink?.getAttribute("href")).toBe("/memory?project=project-1")

    const graphLink = screen.getByText("Graph").closest("a")
    expect(graphLink?.getAttribute("href")).toBe("/graph?project=project-1")
  })
})
