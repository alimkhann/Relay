import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound")
  }),
}))

vi.mock("@/server/policies/viewer", () => ({
  requirePageViewer: vi.fn(async () => ({
    userId: "user-1",
    mode: "session",
    name: "Test",
    email: "test@example.com",
  })),
  syncViewerProfile: vi.fn(async () => {}),
}))

vi.mock("@/server/services/project-canon-service", () => ({
  listProjectCanon: vi.fn(async () => []),
}))

vi.mock("@/server/services/project-service", () => ({
  getProjectDashboardForUser: vi.fn(async () => ({
    project: { id: "project_123", name: "Demo project" },
  })),
}))

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import ProjectPage from "./page"

describe("ProjectPage", () => {
  it("renders the Canon tab as the default project surface", async () => {
    const element = await ProjectPage({
      params: Promise.resolve({ projectId: "project_123" }),
    })
    const { getByText } = render(element)
    expect(getByText("Demo project")).toBeDefined()
    expect(getByText("Canon").closest("a")?.getAttribute("aria-current")).toBe("page")
  })
})
