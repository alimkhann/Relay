import { describe, expect, it } from "vitest";

import {
  ASSOCIATION_TOAST_WINDOW_MS,
  buildHeldReviewAssociation,
  buildPendingAutoSaveAssociation,
  resolveAssociationProjectName,
  resolveAssociationToastAction,
} from "./association-workflow";

describe("association workflow", () => {
  it("starts a pending auto-save toast window instead of saving immediately", () => {
    const result = buildPendingAutoSaveAssociation({
      projectId: "project_relay",
      projectName: "Relay",
      captureSignature: "sig_123",
      now: 100,
    });

    expect(result.chatAssociation.status).toBe("pending");
    expect(result.pending.captureSignature).toBe("sig_123");
    expect(result.toast.mode).toBe("auto_save");
    expect(result.toast.expiresAt).toBe(100 + ASSOCIATION_TOAST_WINDOW_MS);
  });

  it("routes canceling a pending auto-save toast to dismiss instead of capture", () => {
    expect(
      resolveAssociationToastAction({
        mode: "auto_save",
        action: "cancel",
      }),
    ).toBe("dismiss");
  });

  it("creates a held-review toast that expires without forcing a save", () => {
    const result = buildHeldReviewAssociation({
      projectId: "project_relay",
      projectName: "Relay",
      reason: "The latest user turn mentions the project.",
      now: 200,
    });

    expect(result.chatAssociation.status).toBe("held");
    expect(result.toast.mode).toBe("held_review");
    expect(result.toast.expiresAt).toBe(200 + ASSOCIATION_TOAST_WINDOW_MS);
    expect(
      resolveAssociationToastAction({
        mode: "held_review",
        action: "cancel",
      }),
    ).toBe("noop");
  });

  it("approves a held-review toast into an immediate capture", () => {
    expect(
      resolveAssociationToastAction({
        mode: "held_review",
        action: "approve",
      }),
    ).toBe("capture");
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
});
