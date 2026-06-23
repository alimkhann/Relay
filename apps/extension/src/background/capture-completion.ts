import type { SupportedPlatform } from "@relay/shared";

import type { RelayAssociationToastPayload, RelayPageState } from "../messaging/contracts";
import { rememberApprovedAssociation } from "../storage/routing";
import { persistTabSignature } from "../storage/capture-signatures";
import { setRelaySession } from "../storage/session";
import { markMeaningfulActivity } from "../storage/dormancy";
import type { getRelaySession } from "../storage/session";
import { resolveTargetProfile } from "../utils/target-profile";
import { buildDoneToast, resolveAssociationProjectName } from "./association-workflow";
import { RETRY_DRAIN_DELAY_MS, scheduleDrain } from "./drain-scheduler";
import { clearPendingInsertedBrief } from "./tab-state-store";
import { invalidateProjectCache } from "./session-cache";
import { tabStates } from "./state";
import type { RelayTabState } from "./bg-types";
import type { CaptureTabResult } from "./capture-api";
import { recordBackgroundTelemetry } from "./telemetry";

type RelaySessionSnapshot = Awaited<ReturnType<typeof getRelaySession>>;

export async function applySuccessfulCaptureResult(params: {
  result: Extract<CaptureTabResult, { ok: true }>;
  state: RelayTabState;
  session: RelaySessionSnapshot;
  tabId: number;
  projectId: string;
  previousAssociationProjectName: string | null;
  routingCandidateProjectName: string | null;
  chatKey: string;
  manualSelection: boolean;
  skipAssociationToast: boolean;
  autoAssociated: boolean;
  autoCapture: boolean;
  flowId: string;
  rememberProjectSelection(
    projectId: string,
    tabId: number | null,
    pageState: RelayPageState,
    projectName?: string | null,
  ): Promise<void>;
  syncTabRemoteState(tabId: number, options?: { force?: boolean; reason?: string }): Promise<void>;
  showAssociationToast(
    tabId: number,
    toast: RelayAssociationToastPayload,
  ): Promise<void>;
}) {
  const {
    result,
    state,
    session,
    tabId,
    projectId,
    previousAssociationProjectName,
    routingCandidateProjectName,
    chatKey,
    manualSelection,
    skipAssociationToast,
    autoAssociated,
    autoCapture,
    flowId,
    rememberProjectSelection,
    syncTabRemoteState,
    showAssociationToast,
  } = params;
  const matchedProject =
    state.projectOptions.find((project) => project.id === projectId) ??
    session.projectOptions.find((project) => project.id === projectId) ??
    null;
  const projectName = resolveAssociationProjectName({
    matchedProjectName: matchedProject?.name ?? null,
    previousAssociationProjectName,
    routingCandidateProjectName,
    stateProjectName: state.projectName,
    sessionAssumedProjectName: session.assumedProjectName || null,
  });
  const associationProjectName = projectName;

  state.lastCapturedSignature =
    state.page.captureSignature ?? state.lastObservedSignature;
  state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
  state.lastCapturedTurns = state.page.turns ?? state.lastObservedTurns;

  await persistTabSignature(tabId, {
    lastCapturedSignature: state.lastCapturedSignature,
    lastCapturedTurns: state.lastCapturedTurns,
    lastRoutedSignature: state.lastRoutedSignature,
    updatedAt: Date.now(),
  });
  state.associationSuppressed = false;
  state.projectId = projectId;
  state.projectName = projectName || state.projectName;
  state.stateStatus = result.stateStatus ?? state.stateStatus;
  state.lastReconciliation = result.reconciliation ?? null;
  state.chatAssociation = {
    status: "saved",
    projectId,
    projectName: associationProjectName,
    sessionId: result.sessionId ?? null,
    reason: "This chat is currently saved to the project.",
    capturedAt: new Date().toISOString(),
  };
  invalidateProjectCache(projectId);
  if (
    state.pendingInsertedBrief &&
    state.pendingInsertedBrief.projectId === projectId
  ) {
    clearPendingInsertedBrief(state);
  }

  await setRelaySession({
    assumedProjectId: projectId,
    assumedProjectName: projectName,
    resolvedTargetProfileKey: resolveTargetProfile({
      platform: state.page.platform,
      targetMode: session.targetMode,
      manualTargetProfileKey: session.targetProfileKey,
    }),
    stateStatus: result.stateStatus ?? session.stateStatus,
  });
  if (manualSelection) {
    await rememberProjectSelection(projectId, tabId, state.page, projectName);
  }

  if (result.sessionId || result.skippedInsertedContext) {
    await rememberApprovedAssociation({
      key: chatKey,
      projectId,
      projectName: associationProjectName ?? projectName,
      projectSlug: matchedProject?.slug ?? null,
      platform: (state.page.platform ?? null) as SupportedPlatform | null,
      domain: state.page.domain ?? null,
      pathname: state.page.pathname ?? null,
      pageFingerprint: state.page.pageFingerprint ?? null,
      sourceConversationId: state.page.sourceConversationId ?? null,
      url: state.page.url ?? null,
      title: state.page.title ?? null,
      recentUserTurnText: state.page.recentUserTurnText ?? null,
      sessionId: result.sessionId ?? null,
      approvedAt: new Date().toISOString(),
    });
  }

  if (autoCapture) {
    await markMeaningfulActivity("auto_capture_completed").catch(() => undefined);
  }

  await syncTabRemoteState(tabId, {
    force: true,
    reason: "capture_complete",
  });

  if (result.digestStrategy === "deferred") {
    scheduleDrain(projectId);
  }

  if (
    result.digestOutcome &&
    (result.digestOutcome.status === "timed_out" || result.digestOutcome.status === "failed")
  ) {
    scheduleDrain(projectId, RETRY_DRAIN_DELAY_MS);
  }

  if (
    result.digestStrategy === "ai" &&
    result.digestOutcome &&
    result.digestOutcome.status !== "completed"
  ) {
    console.warn("[Relay BG] inline digest did not complete", {
      projectId,
      sessionId: result.sessionId ?? null,
      digestOutcome: result.digestOutcome,
    });
  }

  if (!skipAssociationToast) {
    const digestStatus =
      result.digestStrategy === "ai" && result.digestOutcome?.status === "completed"
        ? "analyzed" as const
        : result.digestStrategy === "deferred" ? "queued" as const
        : null;
    const { toast: doneToast } = buildDoneToast({
      projectId,
      projectName: state.projectName ?? projectName ?? "",
      digestStatus,
      personalSaved: result.personalRouting?.written ?? null,
      personalUnsure: result.personalRouting?.unsure ?? null,
    });
    await showAssociationToast(tabId, doneToast);
  }

  for (const [otherTabId, otherState] of tabStates.entries()) {
    if (otherTabId !== tabId) {
      otherState.lastSuccessfulSyncAt = null;
    }
  }

  if (result.budgetStatus) {
    state.lastBudgetStatus = result.budgetStatus;
  }
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "capture",
    event: "capture_completed",
    flowId,
    message: "Completed extension capture.",
    projectId,
    tabId,
    context: {
      trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
      sessionId: result.sessionId ?? null,
      digestQueued: Boolean(result.digestQueued),
      turnCount: result.turns ?? state.page.turns ?? 0,
      captureSignature: state.page.captureSignature ?? null,
    },
  });
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "association",
    event: "chat_association_updated",
    flowId,
    message: "Saved chat association after capture.",
    projectId,
    tabId,
    context: {
      statusFrom: autoAssociated ? "pending" : "none",
      statusTo: "saved",
      sessionId: result.sessionId ?? null,
      source: autoCapture ? "auto_capture" : manualSelection ? "manual_capture" : "association",
    },
  });

  return {
    ok: true,
    projectId,
    projectName: associationProjectName ?? projectName ?? state.projectName ?? null,
    turns: result.turns ?? state.page.turns ?? 0,
    digestQueued: Boolean(result.digestQueued),
    digestStrategy: result.digestStrategy,
    digestStatus:
      result.digestStrategy === "ai" && result.digestOutcome?.status === "completed"
        ? "analyzed"
        : result.digestStrategy === "deferred"
          ? "queued"
          : null,
    skippedInsertedContext: Boolean(result.skippedInsertedContext),
    reason: result.reason ?? null,
    captured: true,
    autoAssociated,
    sessionId: result.sessionId ?? null,
    stateStatus: result.stateStatus ?? session.stateStatus,
  };
}
