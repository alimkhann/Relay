import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  prefetchMock,
  pushMock,
  startWorkspaceNavigationMock
} = vi.hoisted(() => ({
  prefetchMock: vi.fn(),
  pushMock: vi.fn(),
  startWorkspaceNavigationMock: vi.fn()
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    prefetch: prefetchMock,
    push: pushMock
  })
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: {
    children: React.ReactNode
    href: string
    onClick?: () => void
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
      }}
      {...props}
    >
      {children}
    </a>
  )
}))

vi.mock("@/components/layout/workspace-cache", () => ({
  startWorkspaceNavigation: startWorkspaceNavigationMock
}))

import { SidebarNav } from "./sidebar-nav"

describe("SidebarNav", () => {
  beforeEach(() => {
    prefetchMock.mockClear()
    pushMock.mockClear()
    startWorkspaceNavigationMock.mockClear()
  })

  it("does not start optimistic dashboard navigation when there is no current project", () => {
    render(<SidebarNav />)

    fireEvent.click(screen.getByText("Overview"))

    expect(startWorkspaceNavigationMock).not.toHaveBeenCalled()
  })

  it("starts optimistic dashboard navigation when a current project exists", () => {
    render(<SidebarNav currentProjectId="project-1" />)

    fireEvent.click(screen.getByText("Overview"))

    expect(startWorkspaceNavigationMock).toHaveBeenCalledWith({
      href: "/dashboard?project=project-1",
      cacheKey: "dashboard:project-1",
      kind: "dashboard",
      projectId: "project-1"
    })
  })
})
