import type {
  RelayAssociationToastPayload,
  RelayChatAssociation,
  RelayProjectOption,
} from "../messaging/contracts";

export const ASSOCIATION_TOAST_WINDOW_MS = 20_000;
export const AUTO_SAVE_ASSOCIATION_TOAST_WINDOW_MS = 10_000;
export const HELD_REVIEW_ASSOCIATION_TOAST_WINDOW_MS = 20_000;

export interface PendingAssociationState {
  mode: "auto_save";
  projectId: string;
  projectName: string;
  captureSignature: string | null;
  expiresAt: number;
  remainingMs: number | null;
  paused: boolean;
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
  projectOptions: RelayProjectOption[];
  captureSignature: string | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const expiresAt = now + AUTO_SAVE_ASSOCIATION_TOAST_WINDOW_MS;
  const chatAssociation: RelayChatAssociation = {
    status: "pending",
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: null,
    reason: `Relay will save this chat to ${input.projectName} in 10 seconds unless you cancel.`,
    capturedAt: null,
  };
  const toast: RelayAssociationToastPayload = {
    mode: "auto_save",
    projectId: input.projectId,
    projectName: input.projectName,
    projectOptions: input.projectOptions,
    sessionId: null,
    expiresAt,
  };
  const pending: PendingAssociationState = {
    mode: "auto_save",
    projectId: input.projectId,
    projectName: input.projectName,
    captureSignature: input.captureSignature,
    expiresAt,
    remainingMs: null,
    paused: false,
  };

  return { chatAssociation, toast, pending };
}

export function buildHeldReviewAssociation(input: {
  projectId: string;
  projectName: string;
  projectOptions: RelayProjectOption[];
  reason?: string | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const expiresAt = now + HELD_REVIEW_ASSOCIATION_TOAST_WINDOW_MS;
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
    projectOptions: input.projectOptions,
    sessionId: null,
    expiresAt,
  };

  return { chatAssociation, toast };
}

export function resolveAssociationToastAction(input: {
  mode: "auto_save" | "held_review" | "confirmed";
  action: "approve" | "cancel";
}) {
  if (input.mode === "confirmed") {
    return "dismiss";
  }

  if (input.mode === "auto_save") {
    return input.action === "cancel" ? "dismiss" : "noop";
  }

  return input.action === "approve" ? "capture" : "dismiss";
}

export function getPendingAssociationRemainingMs(
  pending: PendingAssociationState,
  now = Date.now(),
) {
  if (pending.paused && pending.remainingMs !== null) {
    return Math.max(0, pending.remainingMs);
  }

  return Math.max(0, pending.expiresAt - now);
}

export function pausePendingAutoSaveAssociation(
  pending: PendingAssociationState,
  now = Date.now(),
): PendingAssociationState {
  const remainingMs = getPendingAssociationRemainingMs(pending, now);

  return {
    ...pending,
    paused: true,
    remainingMs,
    expiresAt: now + remainingMs,
  };
}

export function resumePendingAutoSaveAssociation(
  pending: PendingAssociationState,
  now = Date.now(),
): PendingAssociationState {
  const remainingMs = getPendingAssociationRemainingMs(pending, now);

  return {
    ...pending,
    paused: false,
    remainingMs: null,
    expiresAt: now + remainingMs,
  };
}

export function buildSavedAssociationFromMemory(input: {
  projectId: string;
  projectName: string;
  sessionId: string | null;
  approvedAt: string | null;
}): RelayChatAssociation {
  return {
    status: "saved",
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: input.sessionId,
    reason: "This chat is currently saved to the project.",
    capturedAt: input.approvedAt,
  };
}
