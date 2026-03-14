import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  WorkspaceViewport,
  getWorkspaceStoreVersionForTests,
  resetWorkspaceStoreForTests,
} from "./workspace-cache"

const snapshot = {
  kind: "dashboard" as const,
  cacheKey: "dashboard:project-1",
  href: "/dashboard?project=project-1",
  project: {
    id: "project-1",
    name: "Relay MVP",
    description: "Browser-first project memory sidecar.",
  },
  dashboard: {
    sessionHistory: [],
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
  },
}

describe("WorkspaceViewport", () => {
  beforeEach(() => {
    resetWorkspaceStoreForTests()
  })

  afterEach(() => {
    resetWorkspaceStoreForTests()
  })

  it("does not republish an equivalent current snapshot on rerender", async () => {
    const { rerender } = render(
      <WorkspaceViewport currentSnapshot={snapshot as any}>
        <div>Dashboard body</div>
      </WorkspaceViewport>,
    )

    expect(screen.getByText("Dashboard body")).toBeTruthy()
    await waitFor(() => {
      expect(getWorkspaceStoreVersionForTests()).toBe(1)
    })

    rerender(
      <WorkspaceViewport
        currentSnapshot={{
          ...snapshot,
          project: { ...snapshot.project },
          dashboard: {
            ...snapshot.dashboard,
            stateStatus: { ...snapshot.dashboard.stateStatus },
            stateOverrides: { ...snapshot.dashboard.stateOverrides },
            derivedProjectState: { ...snapshot.dashboard.derivedProjectState },
          },
        } as any}
      >
        <div>Dashboard body</div>
      </WorkspaceViewport>,
    )

    await waitFor(() => {
      expect(getWorkspaceStoreVersionForTests()).toBe(1)
    })
  })
})
