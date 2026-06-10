import type {
  RelayAssociationToastPayload,
  RelayChatAssociation,
  RelayProjectOption,
} from "../messaging/contracts";

export const DONE_TOAST_DURATION_MS = 3_500;
export const MIN_AUTO_ASSOCIATION_SAVING_TOAST_MS = 1_200;

export function getSavingToastMinimumDelayMs(input: {
  shownAt: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const elapsed = Math.max(0, now - input.shownAt);

  return Math.max(0, MIN_AUTO_ASSOCIATION_SAVING_TOAST_MS - elapsed);
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

export function buildSavingToast(input: {
  projectId: string;
  projectName: string;
  projectOptions: RelayProjectOption[];
}) {
  const chatAssociation: RelayChatAssociation = {
    status: "pending",
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: null,
    reason: `Saving this chat to ${input.projectName}...`,
    capturedAt: null,
  };
  const toast: RelayAssociationToastPayload = {
    mode: "saving",
    projectId: input.projectId,
    projectName: input.projectName,
    projectOptions: input.projectOptions,
    sessionId: null,
    expiresAt: 0,
  };

  return { chatAssociation, toast };
}

export function buildAskToast(input: {
  projectId: string;
  projectName: string;
  projectOptions: RelayProjectOption[];
  reason?: string | null;
}) {
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
    mode: "ask",
    projectId: input.projectId,
    projectName: input.projectName,
    projectOptions: input.projectOptions,
    sessionId: null,
    expiresAt: 0,
    reason: input.reason ?? null,
  };

  return { chatAssociation, toast };
}

export function buildDoneToast(input: {
  projectId: string;
  projectName: string;
  digestStatus?: "analyzed" | "queued" | null;
  personalSaved?: number | null;
  personalUnsure?: number | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const toast: RelayAssociationToastPayload = {
    mode: "done",
    projectId: input.projectId,
    projectName: input.projectName,
    projectOptions: [],
    sessionId: null,
    expiresAt: now + DONE_TOAST_DURATION_MS,
    digestStatus: input.digestStatus ?? null,
    personalSaved: input.personalSaved ?? null,
    personalUnsure: input.personalUnsure ?? null,
  };

  return { toast };
}

export function resolveAssociationToastAction(input: {
  mode: "saving" | "ask";
  action: "approve" | "cancel";
}) {
  if (input.mode === "saving") {
    return input.action === "cancel" ? "dismiss" : "noop";
  }

  return input.action === "approve" ? "capture" : "dismiss";
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
