import { getRelaySession } from "../storage/session";
import { hydrateTabStateFromSession } from "./association";
import type { RelayTabState } from "./bg-types";
import { AUTO_CAPTURE_GRACE_MS } from "./bg-utils";
import { getOrCreateTabState, clearInsertStateTimer, clearPendingInsertedBrief, matchesPendingInsertedBrief } from "./tab-state-store";
import { createEmptyInsertState, shouldScheduleAutoCapture, shouldScheduleAutoCaptureRouting, shouldScheduleIncrementalCapture } from "./tab-state";

let schedulerDeps: {
  broadcastActiveProjectState(tabId: number): Promise<void>;
  captureObservedChange(tabId: number, projectId?: string, options?: any): Promise<any>;
};

export function configureCaptureScheduler(deps: typeof schedulerDeps) {
  schedulerDeps = deps;
}

export function scheduleInsertStateReset(tabId: number, delayMs = 1200) {
  const state = getOrCreateTabState(tabId);
  clearInsertStateTimer(state);
  state.insertStateTimer = setTimeout(() => {
    state.insertStateTimer = null;
    const latestState = getOrCreateTabState(tabId);
    latestState.insertState = createEmptyInsertState();
    void schedulerDeps.broadcastActiveProjectState(tabId);
  }, delayMs);
}

function logAutoCaptureGate(
  reason: string,
  state: RelayTabState,
  sessionProjectOptionsCount: number,
) {
  console.warn("[Relay BG] auto-capture blocked", {
    reason,
    associationStatus: state.chatAssociation.status,
    associationSuppressed: state.associationSuppressed,
    supported: state.page.supported,
    promptReady: state.page.promptReady,
    isFreshChat: state.page.isFreshChat,
    isStable: state.page.isStable,
    isStreaming: state.page.isStreaming,
    turns: state.page.turns ?? 0,
    captureSignature: state.page.captureSignature?.slice(0, 16) ?? null,
    lastCapturedSignature: state.lastCapturedSignature?.slice(0, 16) ?? null,
    lastRoutedSignature: state.lastRoutedSignature?.slice(0, 16) ?? null,
    capturePending: state.capturePending,
    capturePendingAt: state.capturePendingAt,
    projectOptions: state.projectOptions.length,
    sessionProjectOptions: sessionProjectOptionsCount,
    remoteStatus: state.remoteStatus,
  });
}

export async function scheduleAutoCapture(
  tabId: number,
  options: { immediate?: boolean } = {},
) {
  if (!schedulerDeps) return;
  const state = getOrCreateTabState(tabId);
  const session = await getRelaySession();
  hydrateTabStateFromSession(state, session);
  const pendingInsertedBrief = state.pendingInsertedBrief;

  if (pendingInsertedBrief && Date.now() > pendingInsertedBrief.expiresAt) {
    clearPendingInsertedBrief(state);
  }

  const shouldSilentlySaveInsertedBrief =
    Boolean(state.pendingInsertedBrief) &&
    state.chatAssociation.status === "none" &&
    !state.capturePending &&
    shouldScheduleAutoCapture({
      page: state.page,
      capturePending: state.capturePending,
      lastCapturedSignature: state.lastCapturedSignature,
      lastCapturedTurns: state.lastCapturedTurns,
    }) &&
    matchesPendingInsertedBrief(state.pendingInsertedBrief, state.page);

  if (shouldSilentlySaveInsertedBrief) {
    if (state.captureTimer) {
      return;
    }

    state.capturePending = true;
    void schedulerDeps.broadcastActiveProjectState(tabId);
    state.captureTimer = setTimeout(() => {
      state.captureTimer = null;
      const latestState = getOrCreateTabState(tabId);
      const latestPendingInsertedBrief = latestState.pendingInsertedBrief;
      if (
        !latestPendingInsertedBrief ||
        latestState.chatAssociation.status !== "none" ||
        !matchesPendingInsertedBrief(latestPendingInsertedBrief, latestState.page)
      ) {
        latestState.capturePending = false;
        latestState.capturePendingAt = null;
        void schedulerDeps.broadcastActiveProjectState(tabId);
        return;
      }

      void schedulerDeps.captureObservedChange(tabId, latestPendingInsertedBrief.projectId, {
        manualSelection: false,
        skipAssociationToast: true,
      });
    }, options.immediate ? 0 : 120);
    return;
  }

  // Incremental re-capture for saved associations with new content
  if (
    shouldScheduleIncrementalCapture({
      page: state.page,
      capturePending: state.capturePending,
      lastCapturedSignature: state.lastCapturedSignature,
      associationStatus: state.chatAssociation.status,
    }) &&
    state.chatAssociation.projectId
  ) {
    if (state.captureTimer) {
      return;
    }

    state.capturePending = true;
    void schedulerDeps.broadcastActiveProjectState(tabId);
    state.captureTimer = setTimeout(() => {
      state.captureTimer = null;
      const latestState = getOrCreateTabState(tabId);
      const projectId = latestState.chatAssociation.projectId;
      if (!projectId) {
        latestState.capturePending = false;
        latestState.capturePendingAt = null;
        void schedulerDeps.broadcastActiveProjectState(tabId);
        return;
      }
      void schedulerDeps.captureObservedChange(tabId, projectId, {
        manualSelection: false,
        skipAssociationToast: true,
      });
    }, options.immediate ? 0 : 500);
    return;
  }

  const routingInput = {
    page: state.page,
    capturePending: state.capturePending,
    lastCapturedSignature: state.lastCapturedSignature,
    lastCapturedTurns: state.lastCapturedTurns,
    lastRoutedSignature: state.lastRoutedSignature,
    associationStatus: state.chatAssociation.status,
    associationSuppressed: state.associationSuppressed,
    projectOptionsCount: state.projectOptions.length,
    sessionProjectOptionsCount: session.projectOptions.length,
  };
  let routingBlockedReason: string | null = null;
  if (state.associationSuppressed) {
    routingBlockedReason = "association_suppressed";
  } else if (state.chatAssociation.status !== "none") {
    routingBlockedReason = `association_${state.chatAssociation.status}`;
  } else if (state.page.captureSignature && state.page.captureSignature === state.lastRoutedSignature) {
    routingBlockedReason = "already_routed_signature";
  } else if (!state.page.supported) {
    routingBlockedReason = "unsupported_page";
  } else if (state.page.isFreshChat) {
    routingBlockedReason = "fresh_chat";
  } else if (!state.page.isStable) {
    routingBlockedReason = "page_unstable";
  } else if (state.page.isStreaming) {
    routingBlockedReason = "page_streaming";
  } else if ((state.page.turns ?? 0) === 0) {
    routingBlockedReason = "no_turns";
  } else if (!state.page.captureSignature) {
    routingBlockedReason = "missing_signature";
  } else if (state.capturePending) {
    routingBlockedReason = "capture_pending";
  } else if (state.projectOptions.length === 0 && session.projectOptions.length === 0) {
    routingBlockedReason = "no_projects";
  }

  const routingResult = shouldScheduleAutoCaptureRouting(routingInput);
  if (!routingResult) {
    if (state.page.supported && (state.page.turns ?? 0) > 0) {
      logAutoCaptureGate(
        routingBlockedReason ?? "unknown",
        state,
        session.projectOptions.length,
      );
    }
    return;
  }

  if (state.captureTimer) {
    return;
  }

  console.warn("[Relay BG] auto-capture scheduled", {
    tabId,
    immediate: Boolean(options.immediate),
    turns: state.page.turns ?? 0,
    signature: state.page.captureSignature ?? null,
    remoteStatus: state.remoteStatus,
    graceMs: options.immediate ? AUTO_CAPTURE_GRACE_MS : 500,
  });

  void schedulerDeps.captureObservedChange(tabId, undefined, { autoCapture: true });
}
