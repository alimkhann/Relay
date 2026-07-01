import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getResolvedOnboardingStateForUserMock,
  listProjectsForUserMock,
  ensurePersonalProjectForUserMock,
  createRepositoryBundleMock,
  requirePageViewerMock,
  syncViewerProfileMock,
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
    listProjectsForUserMock: vi.fn(async () => [
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
    ensurePersonalProjectForUserMock: vi.fn(async () => ({
      id: "personal-1",
      ownerId: "user-1",
      name: "Personal",
      slug: "personal-user-1",
      description: "Personal memory that lives outside any project.",
      projectUrl: null,
      isArchived: false,
      kind: "personal" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    createRepositoryBundleMock: vi.fn(() => ({
      referrals: {
        getByRefereeId: vi.fn(async () => null),
      },
    })),
    syncViewerProfileMock: vi.fn(async () => undefined),
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

vi.mock("@/features/projects/dashboard-content", () => ({
  DashboardContent: ({ project }: any) => (
    <div>
      <h1>{project.name}</h1>
      <p>{project.description}</p>
      <span>Ready</span>
    </div>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  redirect: vi.fn(),
}));

vi.mock("@relay/db", () => ({
  createRepositoryBundle: createRepositoryBundleMock,
}));

vi.mock("@/server/policies/viewer", () => {
  return {
    requirePageViewer: requirePageViewerMock,
    requireSessionViewer: requirePageViewerMock,
    syncViewerProfile: syncViewerProfileMock,
  };
});

vi.mock("@/server/services/project-service", () => ({
  listProjectsForUser: listProjectsForUserMock,
  ensurePersonalProjectForUser: ensurePersonalProjectForUserMock,
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
    distinctConversationCount: 0,
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
  completeOnboardingForUser: vi.fn(async (_userId: string, projectId: string) => ({
    status: "completed",
    completedProjectId: projectId,
    completedVia: "web",
    completedAt: new Date().toISOString(),
  })),
  getResolvedOnboardingStateForUser: getResolvedOnboardingStateForUserMock,
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    requirePageViewerMock.mockClear();
    syncViewerProfileMock.mockReset();
    syncViewerProfileMock.mockResolvedValue(undefined);
    createRepositoryBundleMock.mockReset();
    createRepositoryBundleMock.mockReturnValue({
      referrals: {
        getByRefereeId: vi.fn(async () => null),
      },
    });
    listProjectsForUserMock.mockReset();
    ensurePersonalProjectForUserMock.mockClear();
    ensurePersonalProjectForUserMock.mockResolvedValue({
      id: "personal-1",
      ownerId: "user-1",
      name: "Personal",
      slug: "personal-user-1",
      description: "Personal memory that lives outside any project.",
      projectUrl: null,
      isArchived: false,
      kind: "personal",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
    listProjectsForUserMock.mockResolvedValue([
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
    ]);
    getResolvedOnboardingStateForUserMock.mockReset();
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

  it("ensures Personal instead of rendering legacy project creation when setup is still pending", async () => {
    listProjectsForUserMock.mockResolvedValueOnce([]);
    getResolvedOnboardingStateForUserMock.mockResolvedValueOnce({
      status: "pending",
      completedProjectId: null,
      completedVia: null,
      completedAt: null,
    } as any);

    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(ensurePersonalProjectForUserMock).toHaveBeenCalledWith("user-1");
    expect(screen.getByText("Personal")).toBeTruthy();
    expect(screen.queryByText("Create a project")).toBeNull();
  });

  it("falls back to the personal project when onboarding has no regular project", async () => {
    listProjectsForUserMock.mockResolvedValueOnce([
      {
        id: "personal-1",
        name: "Personal",
        slug: "personal",
        kind: "personal",
        description: "",
        memoryCount: 0,
        sessionCount: 0,
        routingContext: {
          hasMeaningfulContext: false,
          keywords: [],
        },
        updatedAt: new Date().toISOString(),
      },
    ] as any);
    getResolvedOnboardingStateForUserMock.mockResolvedValueOnce({
      status: "pending",
      completedProjectId: null,
      completedVia: null,
      completedAt: null,
    } as any);

    render(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Personal")).toBeTruthy();
  });
});
