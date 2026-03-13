import { describe, expect, it } from "vitest";

import { deriveAssociationToastState } from "./association-toast";

describe("deriveAssociationToastState", () => {
  it("shows the toast for auto-associated captures when project metadata is only available from session state", () => {
    const result = deriveAssociationToastState({
      autoAssociated: true,
      wasHeldAssociation: false,
      hadSavedAssociation: false,
      sessionId: "session_123",
      matchedProjectName: null,
      previousAssociationProjectName: null,
      routingCandidateProjectName: null,
      stateProjectName: null,
      sessionAssumedProjectName: "Relay",
    });

    expect(result.shouldShowToast).toBe(true);
    expect(result.projectName).toBe("Relay");
  });

  it("shows the toast once for held approvals and suppresses it when the chat was already saved", () => {
    const approvedHeldChat = deriveAssociationToastState({
      autoAssociated: false,
      wasHeldAssociation: true,
      hadSavedAssociation: false,
      sessionId: "session_123",
      matchedProjectName: null,
      previousAssociationProjectName: "Relay",
      routingCandidateProjectName: "Relay candidate",
      stateProjectName: null,
      sessionAssumedProjectName: null,
    });

    const alreadySavedChat = deriveAssociationToastState({
      autoAssociated: false,
      wasHeldAssociation: true,
      hadSavedAssociation: true,
      sessionId: "session_123",
      matchedProjectName: null,
      previousAssociationProjectName: "Relay",
      routingCandidateProjectName: "Relay candidate",
      stateProjectName: null,
      sessionAssumedProjectName: null,
    });

    expect(approvedHeldChat.shouldShowToast).toBe(true);
    expect(approvedHeldChat.projectName).toBe("Relay");
    expect(alreadySavedChat.shouldShowToast).toBe(false);
  });
});
