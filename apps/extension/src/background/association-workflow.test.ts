import { describe, expect, it } from "vitest";

import {
  buildSavedAssociationFromMemory,
  buildSavingToast,
  buildAskToast,
  buildDoneToast,
  DONE_TOAST_DURATION_MS,
  resolveAssociationProjectName,
  resolveAssociationToastAction,
} from "./association-workflow";

describe("association workflow", () => {
  it("builds a saving toast for high-confidence immediate capture", () => {
    const result = buildSavingToast({
      projectId: "project_relay",
      projectName: "Relay",
      projectOptions: [{ id: "project_relay", name: "Relay" }],
    });

    expect(result.chatAssociation.status).toBe("pending");
    expect(result.toast.mode).toBe("saving");
  });

  it("routes canceling a saving toast to dismiss", () => {
    expect(
      resolveAssociationToastAction({
        mode: "saving",
        action: "cancel",
      }),
    ).toBe("dismiss");
  });

  it("builds an ask toast for medium-confidence review", () => {
    const result = buildAskToast({
      projectId: "project_relay",
      projectName: "Relay",
      projectOptions: [{ id: "project_relay", name: "Relay" }],
      reason: "The latest user turn mentions the project.",
    });

    expect(result.chatAssociation.status).toBe("held");
    expect(result.toast.mode).toBe("ask");
    expect(result.toast.reason).toBe("The latest user turn mentions the project.");
    expect(
      resolveAssociationToastAction({
        mode: "ask",
        action: "cancel",
      }),
    ).toBe("dismiss");
  });

  it("approves an ask toast into an immediate capture", () => {
    expect(
      resolveAssociationToastAction({
        mode: "ask",
        action: "approve",
      }),
    ).toBe("capture");
  });

  it("builds a done toast with auto-dismiss expiry", () => {
    const { toast } = buildDoneToast({
      projectId: "project_relay",
      projectName: "Relay",
      digestStatus: "analyzed",
      now: 1000,
    });

    expect(toast.mode).toBe("done");
    expect(toast.digestStatus).toBe("analyzed");
    expect(toast.expiresAt).toBe(1000 + DONE_TOAST_DURATION_MS);
  });

  it("falls back to the best available project name when cached project metadata is stale", () => {
    expect(
      resolveAssociationProjectName({
        matchedProjectName: null,
        previousAssociationProjectName: null,
        routingCandidateProjectName: null,
        stateProjectName: null,
        sessionAssumedProjectName: "Relay",
      }),
    ).toBe("Relay");
  });

  it("builds a saved association directly from remembered routing memory", () => {
    expect(
      buildSavedAssociationFromMemory({
        projectId: "project_relay",
        projectName: "Relay",
        sessionId: "session_123",
        approvedAt: "2026-03-14T00:00:00.000Z",
      }),
    ).toEqual({
      status: "saved",
      projectId: "project_relay",
      projectName: "Relay",
      sessionId: "session_123",
      reason: "This chat is currently saved to the project.",
      capturedAt: "2026-03-14T00:00:00.000Z",
    });
  });
});
