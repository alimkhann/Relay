import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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

describe("DashboardContent", () => {
  beforeEach(() => {
    refresh.mockClear()
    push.mockClear()
    relayClientFetch.mockReset()
  })

  it("shows the project description under the header title", () => {
    render(<DashboardContent project={project} dashboard={dashboard} />)

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
        },
      }),
    })

    render(<DashboardContent project={project} dashboard={dashboard} />)

    fireEvent.mouseEnter(screen.getByText("Relay MVP").parentElement as Element)
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0] as Element)
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
          }),
        }),
      )
    })
    expect(refresh).toHaveBeenCalled()
  })

  it("preserves unsaved project drafts across equivalent rerenders", () => {
    const { rerender } = render(
      <DashboardContent project={project} dashboard={dashboard} />,
    )

    fireEvent.mouseEnter(screen.getByText("Relay MVP").parentElement as Element)
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0] as Element)

    const descriptionInput = screen.getByPlaceholderText(
      "Describe the project so Relay can associate the right chats.",
    )
    fireEvent.change(descriptionInput, {
      target: { value: "Unsaved draft for the same project." },
    })

    rerender(
      <DashboardContent
        project={{ ...project }}
        dashboard={{
          ...dashboard,
          stateStatus: { ...dashboard.stateStatus },
          stateOverrides: { ...dashboard.stateOverrides },
          derivedProjectState: { ...dashboard.derivedProjectState },
        }}
      />,
    )

    expect(
      screen.getByDisplayValue("Unsaved draft for the same project."),
    ).toBeTruthy()
  })
})
