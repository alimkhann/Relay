import type {
  RelayActiveProjectState,
  RelayAssociationTier,
  RelayMessage,
} from "../messaging/contracts";
import { getRelaySession } from "../storage/session";
import type { RelayThemeMode } from "../storage/theme";
import { getRetargetableAssociationProject } from "./association";
import type { RemoteSettingsPayload } from "./bg-types";
import { createPendingOnboardingState } from "./bg-utils";
import { sessionCache, tabStates } from "./state";
import {
  createEmptyActiveProjectState,
  deriveRelayActiveProjectState,
} from "./tab-state";

export async function buildActiveProjectState(
  tabId: number,
): Promise<RelayActiveProjectState> {
  const session = await getRelaySession();
  const state = tabStates.get(tabId);

  if (!state) {
    return createEmptyActiveProjectState();
  }

  const associationProject = getRetargetableAssociationProject(state);
  // A manual project override wins over the chat's auto-derived association in
  // the picker too, so the user sees the project they just switched to.
  const manualProjectId = state.manualProjectId;
  const manualProjectName = manualProjectId
    ? (state.projectOptions.length ? state.projectOptions : session.projectOptions).find(
        (project) => project.id === manualProjectId,
      )?.name ?? state.projectName ?? null
    : null;
  const onboarding = session.onboarding ?? createPendingOnboardingState();
  const effectiveProjectId =
    onboarding.status === "completed"
      ? manualProjectId ??
        associationProject?.projectId ??
        state.projectId ??
        (session.assumedProjectId || null)
      : null;
  const effectiveProjectName =
    onboarding.status === "completed"
      ? (manualProjectId ? manualProjectName : null) ??
        associationProject?.projectName ??
        state.projectName ??
        session.assumedProjectName ??
        session.projectOptions.find((project) => project.id === effectiveProjectId)?.name ??
        null
      : null;
  const associationTier: RelayAssociationTier =
    state.routingReview?.confidence ?? "none";
  const associationToast = state.associationToast;

  return deriveRelayActiveProjectState({
    connected: session.connected && Boolean(session.token),
    projectId: effectiveProjectId,
    projectName: effectiveProjectName,
    projectOptions: state.projectOptions.length
      ? state.projectOptions
      : session.projectOptions,
    showCue: state.showCue,
    page: state.page,
    stateStatus: state.stateStatus ?? session.stateStatus,
    trust: state.trust.updatedAt ? state.trust : session.trust,
    remoteStatus: state.remoteStatus,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    capturePending: state.capturePending,
    capturePendingAt: state.capturePendingAt,
    lastError: state.lastError,
    contextPreview: state.contextPreview,
    chatAssociation: state.chatAssociation,
    routingReview: state.routingReview,
    associationTier,
    associationToast,
    associationSuppressed: state.associationSuppressed,
    insertState: state.insertState,
    onboarding,
    lastReconciliation: state.lastReconciliation,
    lastBudgetStatus: state.lastBudgetStatus,
    entitlements: sessionCache.current?.data.entitlements ?? null,
  });
}

export async function broadcastActiveProjectState(tabId: number) {
  const state = await buildActiveProjectState(tabId);
  const message: RelayMessage = {
    type: "RELAY_ACTIVE_PROJECT_STATE_CHANGED",
    payload: { tabId, state },
  };

  void chrome.runtime.sendMessage(message).catch(() => undefined);
  void chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

export async function broadcastThemeChange(theme: RelayThemeMode) {
  const message: RelayMessage = {
    type: "RELAY_EXTENSION_THEME_CHANGED",
    payload: { theme },
  };

  void chrome.runtime.sendMessage(message).catch(() => undefined);

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    void chrome.tabs.sendMessage(tab.id, message).catch(() => undefined);
  }
}

export async function broadcastUserSettingsChange(
  settings: RemoteSettingsPayload["settings"],
) {
  const message: RelayMessage = {
    type: "RELAY_EXTENSION_USER_SETTINGS_CHANGED",
    payload: { settings: settings as unknown as Record<string, unknown> },
  };

  void chrome.runtime.sendMessage(message).catch(() => undefined);

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    void chrome.tabs.sendMessage(tab.id, message).catch(() => undefined);
  }
}

