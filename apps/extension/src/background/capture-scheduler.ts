import { getRelaySession } from "../storage/session";
import { readApprovedAssociations, type RelayApprovedAssociation } from "../storage/routing";
import {
  canAttemptDormantAutoWake,
  readDormancySnapshot,
  rememberDormantAutoWakeAttempt,
} from "../storage/dormancy";
import { hydrateTabStateFromSession } from "./association";
import type { RelayTabState } from "./bg-types";
import { AUTO_CAPTURE_GRACE_MS } from "./bg-utils";
import { getOrCreateTabState, clearInsertStateTimer, clearPendingInsertedBrief, matchesPendingInsertedBrief } from "./tab-state-store";
import { createEmptyInsertState, shouldScheduleAutoCapture, shouldScheduleAutoCaptureRouting, shouldScheduleIncrementalCapture } from "./tab-state";
import { evaluateProjectRouting, type RelayRoutingDecision } from "./routing";
import type { RelayChatAssociation, RelayPageState, RelayProjectOption } from "../messaging/contracts";

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

export type DormantAutoCaptureResult =
  | {
      allowed: true;
      reason: "high_confidence_local_relevance" | "not_dormant" | "saved_chat";
      routingDecision?: RelayRoutingDecision;
    }
  | {
      allowed: false;
      reason:
        | "association_suppressed"
        | "already_routed_signature"
        | "capture_attempt_limited"
        | "local_relevance_not_high_confidence"
        | "not_dormant"
        | "saved_chat_unchanged"
        | "unsupported_or_unready";
      routingDecision?: RelayRoutingDecision;
    };

export function evaluateDormantAutoCapture(input: {
  dormant: boolean;
  page: RelayPageState;
  chatAssociation: RelayChatAssociation;
  associationSuppressed: boolean;
  projectOptions: RelayProjectOption[];
  sessionProjectOptions: RelayProjectOption[];
  selectedProjectId: string | null;
  approvedAssociations: RelayApprovedAssociation[];
  capturePending?: boolean;
  lastCapturedSignature: string | null;
  lastRoutedSignature: string | null;
  canAttemptSignature: boolean;
}): DormantAutoCaptureResult {
  if (!input.dormant) return { allowed: true, reason: "not_dormant" };
  if (
    !input.page.supported ||
    input.page.isFreshChat ||
    !input.page.isStable ||
    input.page.isStreaming ||
    (input.page.turns ?? 0) === 0 ||
    !input.page.captureSignature ||
    input.capturePending
  ) {
    return { allowed: false, reason: "unsupported_or_unready" };
  }
  if (input.page.captureSignature === input.lastRoutedSignature) {
    return { allowed: false, reason: "already_routed_signature" };
  }
  if (input.associationSuppressed) {
    return { allowed: false, reason: "association_suppressed" };
  }
  if (!input.canAttemptSignature) {
    return { allowed: false, reason: "capture_attempt_limited" };
  }
  if (
    input.chatAssociation.status === "saved" &&
    input.chatAssociation.projectId
  ) {
    return input.page.captureSignature !== input.lastCapturedSignature
      ? { allowed: true, reason: "saved_chat" }
      : { allowed: false, reason: "saved_chat_unchanged" };
  }

  const projects = input.projectOptions.length > 0
    ? input.projectOptions
    : input.sessionProjectOptions;
  const routingDecision = evaluateProjectRouting({
    page: input.page,
    projects,
    selectedProjectId: input.selectedProjectId,
    lastTabProjectId: input.selectedProjectId,
    boundProject: null,
    approvedAssociations: input.approvedAssociations,
  });
  if (
    routingDecision.mode === "auto-save" &&
    routingDecision.confidence === "high" &&
    Boolean(routingDecision.candidateProjectId)
  ) {
    return {
      allowed: true,
      reason: "high_confidence_local_relevance",
      routingDecision,
    };
  }
  return {
    allowed: false,
    reason: "local_relevance_not_high_confidence",
    routingDecision,
  };
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

  const dormancy = await readDormancySnapshot();
  const approvedAssociations = dormancy.dormant ? await readApprovedAssociations() : [];
  const dormantCapture = evaluateDormantAutoCapture({
    dormant: dormancy.dormant,
    page: state.page,
    chatAssociation: state.chatAssociation,
    associationSuppressed: state.associationSuppressed,
    projectOptions: state.projectOptions,
    sessionProjectOptions: session.projectOptions,
    selectedProjectId: state.manualProjectId ?? state.projectId ?? session.projectId ?? null,
    approvedAssociations,
    capturePending: state.capturePending,
    lastCapturedSignature: state.lastCapturedSignature,
    lastRoutedSignature: state.lastRoutedSignature,
    canAttemptSignature: canAttemptDormantAutoWake(
      dormancy.state,
      state.page.captureSignature,
    ),
  });
  if (!dormantCapture.allowed) {
    if (dormancy.dormant && state.page.supported && (state.page.turns ?? 0) > 0) {
      logAutoCaptureGate(
        `dormant_${dormantCapture.reason}`,
        state,
        session.projectOptions.length,
      );
    }
    return;
  }
  const dormantAutoWake = dormancy.dormant;
  const dormantAutoWakeProjectId =
    dormantAutoWake && dormantCapture.allowed
      ? dormantCapture.routingDecision?.candidateProjectId ??
        (dormantCapture.reason === "saved_chat"
          ? state.chatAssociation.projectId ?? undefined
          : undefined)
      : undefined;
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

    if (dormantAutoWake && state.page.captureSignature) {
      await rememberDormantAutoWakeAttempt(state.page.captureSignature);
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
        autoCapture: true,
        skipAssociationAdjudication: dormantAutoWake,
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

  if (dormantAutoWake && state.page.captureSignature) {
    await rememberDormantAutoWakeAttempt(state.page.captureSignature);
  }
  console.warn("[Relay BG] auto-capture scheduled", {
    tabId,
    immediate: Boolean(options.immediate),
    turns: state.page.turns ?? 0,
    signature: state.page.captureSignature ?? null,
    remoteStatus: state.remoteStatus,
    graceMs: options.immediate ? AUTO_CAPTURE_GRACE_MS : 500,
  });

  void schedulerDeps.captureObservedChange(tabId, dormantAutoWakeProjectId, {
    autoCapture: true,
    skipAssociationAdjudication: dormantAutoWake,
  });
}
