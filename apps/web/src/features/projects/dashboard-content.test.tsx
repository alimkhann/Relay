import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const refresh = vi.fn()
const push = vi.fn()
const relayClientFetch = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
    push,
  }),
}))

vi.mock("motion/react", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const Tag = String(prop)
        return ({ children, ...props }: any) => {
          const {
            initial,
            animate,
            exit,
            transition,
            whileHover,
            whileTap,
            ...rest
          } = props
          return <Tag {...rest}>{children}</Tag>
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock("@/features/projects/governance-section", () => ({
  GovernanceSection: () => <div>Governance</div>,
}))

vi.mock("@/lib/telemetry/fetch", () => ({
  relayClientFetch: (...args: unknown[]) => relayClientFetch(...args),
}))

import { DashboardContent } from "./dashboard-content"

const project = {
  id: "project-1",
  name: "Relay MVP",
  description: "Browser-first project memory sidecar.",
  projectUrl: "https://www.onrelay.app",
}

const dashboard = {
  sessionHistory: [],
  distinctConversationCount: 0,
  packets: [],
  memory: [],
  stateStatus: {
    projectStateReady: true,
    digestStatus: "completed",
    rawCapturePresent: true,
    digestErrorMessage: null,
    lastCapturedAt: null,
    lastDigestAt: null,
    activeJobId: null,
    activeJobStatus: "completed",
    activeJobStage: "completed",
    activeJobAttempts: 1,
    fallbackPlanned: false,
    fallbackUsed: false,
  },
  stateOverrides: {
    projectOverviewOverride: null,
    currentObjectiveOverride: null,
    recentProgressOverride: null,
    hiddenDecisions: [],
    hiddenConstraints: [],
    hiddenOpenTasks: [],
    updatedAt: new Date().toISOString(),
  },
  derivedProjectState: {
    projectOverview: null,
    currentObjective: null,
    stackDomain: null,
    recentProgress: null,
    decisions: [],
    constraints: [],
    openTasks: [],
    relevantTools: [],
    lastBootstrapAt: null,
    dirty: false,
    updatedAt: new Date().toISOString(),
  },
  projectState: null,
} as any

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  // Seed the shared project dashboard query so useProjectDashboard resolves
  // synchronously without hitting the network.
  queryClient.setQueryData(["dashboard", project.id], dashboard)
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
  return {
    ...result,
    rerender: (next: ReactElement) =>
      result.rerender(
        <QueryClientProvider client={queryClient}>{next}</QueryClientProvider>,
      ),
  }
}

describe("DashboardContent", () => {
  beforeEach(() => {
    refresh.mockClear()
    push.mockClear()
    relayClientFetch.mockReset()
    // Default response for background refetches triggered by invalidation.
    relayClientFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ project, dashboard }),
    })
  })

  it("shows the project description under the header title", () => {
    renderWithClient(<DashboardContent project={project} />)

    expect(
      screen.getAllByText("Browser-first project memory sidecar.").length,
    ).toBeGreaterThan(0)
  })

  it("saves inline project metadata edits through the project update API", async () => {
    relayClientFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        project: {
          name: "Relay",
          description: "Quiet AI continuity layer.",
          projectUrl: "https://www.onrelay.app",
        },
      }),
    })

    renderWithClient(<DashboardContent project={project} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit project" }))
    fireEvent.change(screen.getByDisplayValue("Relay MVP"), {
      target: { value: "Relay" },
    })
    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe the project so Relay can associate the right chats.",
      ),
      {
        target: { value: "Quiet AI continuity layer." },
      },
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(relayClientFetch).toHaveBeenCalledWith(
        "/api/projects/project-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Relay",
            description: "Quiet AI continuity layer.",
            projectUrl: "https://www.onrelay.app",
          }),
        }),
      )
    })
  })

  it("preserves unsaved project drafts across equivalent rerenders", () => {
    const { rerender } = renderWithClient(
      <DashboardContent project={project} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Edit project" }))

    const descriptionInput = screen.getByPlaceholderText(
      "Describe the project so Relay can associate the right chats.",
    )
    fireEvent.change(descriptionInput, {
      target: { value: "Unsaved draft for the same project." },
    })

    rerender(
      <DashboardContent project={{ ...project }} />,
    )

    expect(
      screen.getByDisplayValue("Unsaved draft for the same project."),
    ).toBeTruthy()
  })
})
