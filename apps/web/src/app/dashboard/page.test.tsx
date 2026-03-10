import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/server/services/project-service", () => ({
  listProjectsForUser: vi.fn(async () => [
    {
      id: "project-relay-mvp",
      name: "Relay MVP",
      slug: "relay-mvp",
      description: "Browser-first project memory sidecar.",
      memoryCount: 3,
      sessionCount: 1,
      updatedAt: new Date().toISOString()
    }
  ]),
  getProjectDashboardForUser: vi.fn(async () => ({
    project: {
      id: "project-relay-mvp",
      name: "Relay MVP",
      slug: "relay-mvp",
      description: "Browser-first project memory sidecar.",
      memoryCount: 3,
      sessionCount: 1,
      updatedAt: new Date().toISOString()
    },
    recentSessions: [],
    memory: [],
    packets: []
  }))
}))

import DashboardPage from "./page"

describe("DashboardPage", () => {
  it("renders workspace heading", async () => {
    render(await DashboardPage())

    expect(screen.getByText("Current workspace")).toBeTruthy()
  })
})
