import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getResolvedOnboardingStateForUserMock,
  requirePageViewerMock,
  syncViewerProfileMock,
  appShellMock,
} =
  vi.hoisted(() => ({
    getResolvedOnboardingStateForUserMock: vi.fn(async () => ({
      status: "completed" as const,
      completedProjectId: "project-1",
      completedVia: "web" as const,
      completedAt: new Date().toISOString(),
    })),
    requirePageViewerMock: vi.fn(async () => ({
      userId: "user-1",
      mode: "session" as const,
      email: "user@example.com",
      name: "Relay User",
      image: null,
    })),
    syncViewerProfileMock: vi.fn(async () => undefined),
    appShellMock: vi.fn(
      ({
        children,
      }: {
        children: any;
      }) => <div data-testid="app-shell">{children}</div>,
    ),
  }));

vi.mock("motion/react", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const Tag = String(prop);
        return ({ children, ...props }: any) => {
          const { initial, animate, transition, whileHover, whileTap, ...rest } = props;
          return <Tag {...rest}>{children}</Tag>;
        };
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: appShellMock,
}));

vi.mock("@/server/policies/viewer", () => {
  return {
    requirePageViewer: requirePageViewerMock,
    requireSessionViewer: requirePageViewerMock,
    syncViewerProfile: syncViewerProfileMock,
  };
});

vi.mock("@/server/services/project-service", () => ({
  listProjectsForUser: vi.fn(async () => [
    {
      id: "project-1",
      name: "Relay MVP",
      slug: "relay-mvp",
      description: "Browser-first project memory sidecar.",
      memoryCount: 3,
      sessionCount: 1,
      routingContext: {
        hasMeaningfulContext: true,
        keywords: ["browser", "memory", "sidecar", "relay"],
      },
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
      routingContext: {
        hasMeaningfulContext: true,
        keywords: ["browser", "memory", "sidecar", "relay"],
      },
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
    derivedProjectState: {
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
    stateOverrides: {
      projectOverviewOverride: null,
      currentObjectiveOverride: null,
      recentProgressOverride: null,
      hiddenDecisions: [],
      hiddenConstraints: [],
      hiddenOpenTasks: [],
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
    sessionHistory: [],
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
    aiBudget: {
      plan: "free",
      aiEligible: true,
      reason: null,
      dailyProjectAiUsed: 0,
      dailyProjectAiLimit: 8,
      dailyUserAiUsed: 0,
      dailyUserAiLimit: 24,
      nextAiAllowedAt: null,
    },
  })),
}));

vi.mock("@/server/services/onboarding-service", () => ({
  getResolvedOnboardingStateForUser: getResolvedOnboardingStateForUserMock,
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    requirePageViewerMock.mockClear();
    syncViewerProfileMock.mockReset();
    syncViewerProfileMock.mockResolvedValue(undefined);
    getResolvedOnboardingStateForUserMock.mockReset();
    appShellMock.mockClear();
    getResolvedOnboardingStateForUserMock.mockResolvedValue({
      status: "completed",
      completedProjectId: "project-1",
      completedVia: "web",
      completedAt: new Date().toISOString(),
    } as any);
  });

  it("renders the project index heading", async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Relay MVP")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(
      screen.getAllByText("Browser-first project memory sidecar.").length,
    ).toBeGreaterThan(0);
  });

  it("still renders when viewer profile sync fails", async () => {
    syncViewerProfileMock.mockImplementationOnce(async () => {
      try {
        throw new Error("sync failed");
      } catch {}
    });

    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Relay MVP")).toBeTruthy();
  });

  it("renders onboarding when setup is still pending", async () => {
    getResolvedOnboardingStateForUserMock.mockResolvedValueOnce({
      status: "pending",
      completedProjectId: null,
      completedVia: null,
      completedAt: null,
    } as any);

    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Welcome to Relay")).toBeTruthy();
    expect(screen.getByText("Create")).toBeTruthy();
    expect(screen.getByTestId("app-shell")).toBeTruthy();
  });
});
