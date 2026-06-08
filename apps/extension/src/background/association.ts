import type { ProjectDashboardDto } from "@relay/shared";

import type {
  RelayChatAssociation,
  RelayPageState,
  RelayProjectOption,
} from "../messaging/contracts";
import {
  clearManualOverride,
  isFreshChatKeyUpgrade,
  readManualOverride,
  rememberManualOverride,
} from "../storage/routing";
import { getRelaySession, setRelaySession } from "../storage/session";
import { resolveAssociationProjectName } from "./association-workflow";
import type { ProjectDashboardPayload, RelayTabState } from "./bg-types";
import { buildAssociationKey } from "./routing";
import { createEmptyChatAssociation } from "./tab-state";

export function findMatchingSession(
  sessions: ProjectDashboardDto["sessionHistory"],
  page: RelayPageState,
) {
  const candidates = sessions ?? [];
  const matched =
    candidates.find(
      (session) =>
        Boolean(page.pageFingerprint) &&
        session.pageFingerprint === page.pageFingerprint,
    ) ??
    candidates.find(
      (session) =>
        Boolean(page.captureSignature) &&
        session.captureSignature === page.captureSignature,
    ) ??
    candidates.find((session) => Boolean(page.url) && session.url === page.url);

  return matched ?? null;
}

export function buildSavedChatAssociation(
  page: RelayPageState,
  project: RelayProjectOption | null,
  dashboard: ProjectDashboardPayload | null | undefined,
): RelayChatAssociation {
  if (!project || !dashboard) {
    return createEmptyChatAssociation();
  }

  const matchingSession = findMatchingSession(dashboard.sessionHistory, page);
  if (!matchingSession) {
    return createEmptyChatAssociation();
  }

  return {
    status: matchingSession.isArchived ? "archived" : "saved",
    projectId: project.id,
    projectName: project.name,
    sessionId: matchingSession.id,
    reason: matchingSession.isArchived
      ? "This chat was detached from the project."
      : "This chat is currently saved to the project.",
    capturedAt: matchingSession.archivedAt ?? matchingSession.capturedAt ?? null,
  };
}

export function getRetargetableAssociationProject(state: RelayTabState) {
  if (
    (state.chatAssociation.status === "pending" ||
      state.chatAssociation.status === "held" ||
      state.chatAssociation.status === "saved") &&
    state.chatAssociation.projectId
  ) {
    return {
      projectId: state.chatAssociation.projectId,
      projectName: state.chatAssociation.projectName,
    };
  }

  return null;
}

export function findProjectOption(
  state: RelayTabState,
  session: Awaited<ReturnType<typeof getRelaySession>>,
  projectId: string | null | undefined,
) {
  if (!projectId) return null;

  return (
    state.projectOptions.find((project) => project.id === projectId) ??
    session.projectOptions.find((project) => project.id === projectId) ??
    null
  );
}

export function resolveAssociationProjectOption(
  state: RelayTabState,
  session: Awaited<ReturnType<typeof getRelaySession>>,
  projectId: string | null | undefined,
) {
  const matchedProject = findProjectOption(state, session, projectId);
  if (!matchedProject || !projectId) {
    return null;
  }

  const projectName = resolveAssociationProjectName({
    matchedProjectName: matchedProject.name ?? null,
    previousAssociationProjectName: state.chatAssociation.projectName,
    routingCandidateProjectName: null,
    stateProjectName: state.projectName,
    sessionAssumedProjectName: session.assumedProjectName || null,
  });

  return {
    projectId,
    projectName,
    projectSlug: matchedProject.slug ?? null,
  };
}

export function updateAssociationProjectState(
  state: RelayTabState,
  projectId: string,
  projectName: string,
) {
  state.projectId = projectId;
  state.projectName = projectName;

  if (state.chatAssociation.status === "pending") {
    state.chatAssociation = {
      ...state.chatAssociation,
      projectId,
      projectName,
      reason: `Saving this chat to ${projectName}...`,
    };
  } else if (state.chatAssociation.status === "held") {
    state.chatAssociation = {
      ...state.chatAssociation,
      projectId,
      projectName,
      reason: `Relay wants confirmation before saving this chat to ${projectName}.`,
    };
  }

  if (state.associationToast.visible) {
    state.associationToast = {
      ...state.associationToast,
      projectId,
      projectName,
    };
  }
}

export async function setSessionProjectTarget(
  projectId: string,
  projectName: string,
) {
  await setRelaySession({
    projectId,
    assumedProjectId: projectId,
    assumedProjectName: projectName,
  });
}

export async function setEffectiveProjectTarget(
  state: RelayTabState,
  projectId: string,
  projectName: string,
  options: { persist?: boolean } = {},
) {
  state.projectId = projectId;
  state.projectName = projectName;
  updateAssociationProjectState(state, projectId, projectName);

  if (options.persist !== false) {
    await setSessionProjectTarget(projectId, projectName);
  }
}

export function hydrateTabStateFromSession(state: RelayTabState, session: Awaited<ReturnType<typeof getRelaySession>>) {
  const hasCachedProjects = session.projectOptions.length > 0;

  if (!state.projectOptions.length && hasCachedProjects) {
    state.projectOptions = session.projectOptions;
  }

  if (!state.projectId && session.assumedProjectId) {
    state.projectId = session.assumedProjectId;
    state.projectName =
      state.projectName ||
      session.assumedProjectName ||
      session.projectOptions.find((project) => project.id === session.assumedProjectId)?.name ||
      null;
  }

  if (!state.stateStatus && session.stateStatus) {
    state.stateStatus = session.stateStatus;
  }

  if (!state.trust.updatedAt && session.trust.updatedAt) {
    state.trust = session.trust;
  }
}

/**
 * Reconcile the per-tab manual project override against the current chat.
 * - Drops the override when the user navigated to a different conversation.
 * - Hydrates it from persisted storage when this tab/chat has one but the
 *   in-memory state lost it (e.g. MV3 service-worker restart, reopened tab).
 * Call before resolving the active project on a supported page.
 */
export async function reconcileManualOverride(state: RelayTabState): Promise<void> {
  if (!state.page.supported) return;
  const currentChatKey = buildAssociationKey(state.page);

  if (state.manualProjectChatKey && state.manualProjectChatKey !== currentChatKey) {
    if (isFreshChatKeyUpgrade(state.manualProjectChatKey, currentChatKey)) {
      // Same chat, just gained a stable id — migrate the override to the new key
      // so Personal (or any manual pick) stays after the first answer.
      const projectId = state.manualProjectId;
      await clearManualOverride(state.manualProjectChatKey);
      if (projectId) {
        await rememberManualOverride(currentChatKey, projectId);
        state.manualProjectChatKey = currentChatKey;
      }
    } else {
      // Navigated to a genuinely different conversation — drop the override.
      await clearManualOverride(state.manualProjectChatKey);
      state.manualProjectId = null;
      state.manualProjectChatKey = null;
    }
  }

  // Rehydrate from durable storage when memory was cleared.
  if (!state.manualProjectId) {
    const persisted = await readManualOverride(currentChatKey);
    if (persisted) {
      state.manualProjectId = persisted.projectId;
      state.manualProjectChatKey = currentChatKey;
    }
  }
}
