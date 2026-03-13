import type {
  RelayAssociationToastPayload,
  RelayChatAssociation,
} from "../messaging/contracts";

export const ASSOCIATION_TOAST_WINDOW_MS = 5_000;

export interface PendingAssociationState {
  mode: "auto_save";
  projectId: string;
  projectName: string;
  captureSignature: string | null;
  expiresAt: number;
}

export interface ResolveAssociationProjectNameInput {
  matchedProjectName?: string | null;
  previousAssociationProjectName?: string | null;
  routingCandidateProjectName?: string | null;
  stateProjectName?: string | null;
  sessionAssumedProjectName?: string | null;
}

function normalizeName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveAssociationProjectName(
  input: ResolveAssociationProjectNameInput,
) {
  return (
    normalizeName(input.matchedProjectName) ??
    normalizeName(input.previousAssociationProjectName) ??
    normalizeName(input.routingCandidateProjectName) ??
    normalizeName(input.stateProjectName) ??
    normalizeName(input.sessionAssumedProjectName) ??
    "the selected project"
  );
}

export function buildPendingAutoSaveAssociation(input: {
  projectId: string;
  projectName: string;
  captureSignature: string | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const expiresAt = now + ASSOCIATION_TOAST_WINDOW_MS;
  const chatAssociation: RelayChatAssociation = {
    status: "pending",
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: null,
    reason: `Relay will save this chat to ${input.projectName} in 5 seconds unless you cancel.`,
    capturedAt: null,
  };
  const toast: RelayAssociationToastPayload = {
    mode: "auto_save",
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: null,
    expiresAt,
  };
  const pending: PendingAssociationState = {
    mode: "auto_save",
    projectId: input.projectId,
    projectName: input.projectName,
    captureSignature: input.captureSignature,
    expiresAt,
  };

  return { chatAssociation, toast, pending };
}

export function buildHeldReviewAssociation(input: {
  projectId: string;
  projectName: string;
  reason?: string | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const expiresAt = now + ASSOCIATION_TOAST_WINDOW_MS;
  const chatAssociation: RelayChatAssociation = {
    status: "held",
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: null,
    reason:
      input.reason ??
      "Relay wants confirmation before saving this chat to a project.",
    capturedAt: null,
  };
  const toast: RelayAssociationToastPayload = {
    mode: "held_review",
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: null,
    expiresAt,
  };

  return { chatAssociation, toast };
}

export function resolveAssociationToastAction(input: {
  mode: "auto_save" | "held_review";
  action: "approve" | "cancel";
}) {
  if (input.mode === "auto_save") {
    return input.action === "cancel" ? "dismiss" : "noop";
  }

  return input.action === "approve" ? "capture" : "noop";
}
