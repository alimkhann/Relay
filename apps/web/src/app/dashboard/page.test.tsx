import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: any }) => <div>{children}</div>,
}));

vi.mock("@/server/policies/viewer", () => ({
  requireSessionViewer: vi.fn(async () => ({
    userId: "user-1",
    mode: "session",
  })),
}));

vi.mock("@/server/services/project-service", () => ({
  listProjectsForUser: vi.fn(async () => [
    {
      id: "project-1",
      name: "Relay MVP",
      slug: "relay-mvp",
      description: "Browser-first project memory sidecar.",
      memoryCount: 3,
      sessionCount: 1,
      updatedAt: new Date().toISOString(),
    },
  ]),
  getProjectDashboardForUser: vi.fn(async () => ({
    project: {
      id: "project-1",
      name: "Relay MVP",
      slug: "relay-mvp",
      description: "Browser-first project memory sidecar.",
      memoryCount: 3,
      sessionCount: 1,
      updatedAt: new Date().toISOString(),
    },
    projectState: {
      projectOverview: "Browser-first project memory sidecar.",
      currentObjective: "Ship Relay v2.",
      stackDomain: null,
      recentProgress: "Server pipeline is in place.",
      decisions: ["Use Neon"],
      constraints: [],
      openTasks: ["Finish redesign"],
      relevantTools: ["Gemini"],
      lastBootstrapAt: null,
      dirty: true,
      updatedAt: new Date().toISOString(),
    },
    stateStatus: {
      rawCapturePresent: true,
      digestStatus: "completed",
      projectStateReady: true,
      digestErrorMessage: null,
      lastCapturedAt: new Date().toISOString(),
      lastDigestAt: new Date().toISOString(),
      activeJobId: null,
      activeJobStatus: "completed",
      activeJobStage: "completed",
      activeJobAttempts: 1,
      fallbackPlanned: true,
      fallbackUsed: false,
    },
    recentSessions: [],
    recentDigests: [],
    memory: [
      {
        id: "memory-1",
        type: "decision",
        title: "Use Neon",
        content: "Auth and DB are now on Neon.",
        pinned: true,
        updatedAt: new Date().toISOString(),
      },
    ],
    packets: [],
    legacyPackets: [],
  })),
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("renders the project index heading", async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByText("Pick the project you want Relay to keep ready"),
    ).toBeTruthy();
  });
});
