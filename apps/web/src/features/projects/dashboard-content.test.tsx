import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const push = vi.fn();
const relayClientFetch = vi.fn();

vi.mock("motion/react", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const Tag = String(prop);
        return ({ children, ...props }: any) => {
          const {
            initial,
            animate,
            exit,
            transition,
            whileHover,
            whileTap,
            ...rest
          } = props;
          return <Tag {...rest}>{children}</Tag>;
        };
      },
    },
  ),
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

vi.mock("@/lib/telemetry/client", () => ({
  createClientFlowId: () => "flow_dashboard",
}));

vi.mock("@/lib/telemetry/fetch", () => ({
  relayClientFetch: (...args: unknown[]) => relayClientFetch(...args),
}));

import { DashboardContent } from "./dashboard-content";

const dashboard = {
  project: {
    id: "project-1",
    name: "Relay MVP",
    description: "Browser-first project memory sidecar.",
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
  memory: [],
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
} as const;

describe("DashboardContent", () => {
  it("shows the project description under the header title", () => {
    render(
      <DashboardContent
        project={{
          id: "project-1",
          name: "Relay MVP",
          description: "Browser-first project memory sidecar.",
        }}
        dashboard={dashboard as any}
      />,
    );

    expect(
      screen.getAllByText("Browser-first project memory sidecar.").length,
    ).toBeGreaterThan(0);
  });

  it("saves inline project metadata edits through the project update API", async () => {
    relayClientFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        project: {
          name: "Relay",
          description: "Quiet AI continuity layer.",
        },
      }),
    });

    render(
      <DashboardContent
        project={{
          id: "project-1",
          name: "Relay MVP",
          description: "Browser-first project memory sidecar.",
        }}
        dashboard={dashboard as any}
      />,
    );

    // Hover over the project name to reveal the edit button
    const heading = screen.getByRole("heading", { name: "Relay MVP" });
    fireEvent.mouseEnter(heading.parentElement!);
    const editButton = screen.getAllByRole("button", { name: /edit/i })[0]!;
    fireEvent.click(editButton);
    fireEvent.change(screen.getByDisplayValue("Relay MVP"), {
      target: { value: "Relay" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Describe the project so Relay can associate the right chats.",
      ),
      {
        target: { value: "Quiet AI continuity layer." },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
      );
    });
    expect(refresh).toHaveBeenCalled();
  });
});
