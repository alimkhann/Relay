import { describe, expect, it } from "vitest";

import {
  AUTO_SAVE_ASSOCIATION_TOAST_WINDOW_MS,
  buildSavedAssociationFromMemory,
  buildHeldReviewAssociation,
  buildPendingAutoSaveAssociation,
  getPendingAssociationRemainingMs,
  HELD_REVIEW_ASSOCIATION_TOAST_WINDOW_MS,
  pausePendingAutoSaveAssociation,
  resumePendingAutoSaveAssociation,
  resolveAssociationProjectName,
  resolveAssociationToastAction,
} from "./association-workflow";

describe("association workflow", () => {
  it("starts a pending auto-save toast window instead of saving immediately", () => {
    const result = buildPendingAutoSaveAssociation({
      projectId: "project_relay",
      projectName: "Relay",
      projectOptions: [{ id: "project_relay", name: "Relay" }],
      captureSignature: "sig_123",
      now: 100,
    });

    expect(result.chatAssociation.status).toBe("pending");
    expect(result.pending.captureSignature).toBe("sig_123");
    expect(result.toast.mode).toBe("auto_save");
    expect(result.toast.expiresAt).toBe(
      100 + AUTO_SAVE_ASSOCIATION_TOAST_WINDOW_MS,
    );
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
      projectOptions: [{ id: "project_relay", name: "Relay" }],
      reason: "The latest user turn mentions the project.",
      now: 200,
    });

    expect(result.chatAssociation.status).toBe("held");
    expect(result.toast.mode).toBe("held_review");
    expect(result.toast.expiresAt).toBe(
      200 + HELD_REVIEW_ASSOCIATION_TOAST_WINDOW_MS,
    );
    expect(
      resolveAssociationToastAction({
        mode: "held_review",
        action: "cancel",
      }),
    ).toBe("dismiss");
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

  it("pauses and resumes a pending auto-save timer without losing remaining time", () => {
    const { pending } = buildPendingAutoSaveAssociation({
      projectId: "project_relay",
      projectName: "Relay",
      projectOptions: [{ id: "project_relay", name: "Relay" }],
      captureSignature: "sig_123",
      now: 1_000,
    });

    const paused = pausePendingAutoSaveAssociation(pending, 6_000);
    expect(paused.paused).toBe(true);
    expect(getPendingAssociationRemainingMs(paused, 12_000)).toBe(
      AUTO_SAVE_ASSOCIATION_TOAST_WINDOW_MS - 5_000,
    );

    const resumed = resumePendingAutoSaveAssociation(paused, 12_000);
    expect(resumed.paused).toBe(false);
    expect(resumed.expiresAt).toBe(
      12_000 + (AUTO_SAVE_ASSOCIATION_TOAST_WINDOW_MS - 5_000),
    );
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
