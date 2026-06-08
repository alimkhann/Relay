
import type {
  RelayAssociationToastPayload,
  RelayMessage,
  RelayPageState,
} from "../messaging/contracts";
import { clearManualOverride, isIgnoredChatKey, readAssociationAdjudication, readApprovedAssociations, rememberAssociationAdjudication, rememberIgnoredChatKey, removeApprovedAssociationBySession } from "../storage/routing";
import { getRelaySession } from "../storage/session";
import { relayFetch } from "../utils/api";
import { buildAskToast, buildSavedAssociationFromMemory, buildSavingToast, resolveAssociationToastAction } from "./association-workflow";
import { resolveAssociationProjectOption, setSessionProjectTarget, updateAssociationProjectState } from "./association";
import { buildActiveProjectState } from "./active-project";
import { readErrorResponse } from "./bg-utils";
import { invalidateProjectCache } from "./session-cache";
import { clearAssociationToast, clearAssociationToastTimer, clearPendingAssociation, getOrCreateTabState } from "./tab-state-store";
import { buildAssociationKey, evaluateProjectRouting, type RelayRoutingDecision } from "./routing";
import { recordBackgroundTelemetry } from "./telemetry";
import type { RelayTabState } from "./bg-types";

let associationDeps: {
  broadcastActiveProjectState(tabId: number): Promise<void>;
  captureObservedChange(tabId: number, projectId?: string, options?: any): Promise<any>;
  syncTabRemoteState(tabId: number, options?: { force?: boolean; reason?: string }): Promise<void>;
};

export function configureAssociationController(deps: typeof associationDeps) {
  associationDeps = deps;
}

export function setAssociationToastState(
  state: RelayTabState,
  payload: RelayAssociationToastPayload,
) {
  state.associationToast = {
    visible: true,
    mode: payload.mode,
    projectId: payload.projectId,
    projectName: payload.projectName,
    projectOptions: payload.projectOptions,
    sessionId: payload.sessionId ?? null,
    expiresAt: payload.expiresAt,
    digestStatus: payload.digestStatus ?? null,
    reason: payload.reason ?? null,
    personalSaved: payload.personalSaved ?? null,
    personalUnsure: payload.personalUnsure ?? null,
  };
}

export async function clearAssociationToastForTab(tabId: number) {
  const state = getOrCreateTabState(tabId);
  if (!state.associationToast.visible) {
    return;
  }

  clearAssociationToast(state);
  await associationDeps.broadcastActiveProjectState(tabId);
}

export function scheduleAssociationToastExpiry(
  tabId: number,
  payload: RelayAssociationToastPayload,
) {
  const state = getOrCreateTabState(tabId);
  clearAssociationToastTimer(state);

  const delay = Math.max(0, payload.expiresAt - Date.now());
  state.associationToastTimer = setTimeout(() => {
    state.associationToastTimer = null;
    const latestState = getOrCreateTabState(tabId);
    if (
      latestState.associationToast.visible &&
      latestState.associationToast.projectId === payload.projectId &&
      latestState.associationToast.mode === payload.mode
    ) {
      void clearAssociationToastForTab(tabId);
    }
  }, delay);
}

export function describeApprovedAssociationReason(
  page: RelayPageState,
  association: Awaited<ReturnType<typeof readApprovedAssociations>>[number],
) {
  if (association.key && association.key === buildAssociationKey(page)) {
    return "Matched a previously approved chat fingerprint.";
  }

  if (page.pageFingerprint && association.pageFingerprint === page.pageFingerprint) {
    return "Matched a previously approved chat fingerprint.";
  }

  if (page.url && association.url === page.url) {
    return "Matched a previously approved chat URL.";
  }

  if (
    page.pathname &&
    page.platform &&
    association.pathname === page.pathname &&
    association.platform === page.platform
  ) {
    return "Matched a previously approved chat path on this platform.";
  }

  return "Matched a previously approved chat.";
}

export function restoreApprovedAssociationState(
  state: RelayTabState,
  association: Awaited<ReturnType<typeof readApprovedAssociations>>[number],
) {
  clearPendingAssociation(state);
  clearAssociationToast(state);
  // Don't update lastCapturedSignature here — no actual capture happened.
  // This allows shouldScheduleAutoCapture to fire and re-capture new content.
  state.lastRoutedSignature = state.page.captureSignature ?? buildAssociationKey(state.page);
  state.projectId = association.projectId;
  state.projectName = association.projectName;
  state.associationSuppressed = false;
  state.chatAssociation = buildSavedAssociationFromMemory({
    projectId: association.projectId,
    projectName: association.projectName,
    sessionId: association.sessionId,
    approvedAt: association.approvedAt,
  });
  state.routingReview = {
    confidence: "high",
    score: 100,
    reasons: [describeApprovedAssociationReason(state.page, association)],
  };
}

export async function showAssociationToast(
  tabId: number,
  payload: RelayAssociationToastPayload,
) {
  const state = getOrCreateTabState(tabId);
  setAssociationToastState(state, payload);
  // Only auto-dismiss "done" toasts; "saving" and "ask" stay until resolved
  if (payload.mode === "done" && payload.expiresAt > 0) {
    scheduleAssociationToastExpiry(tabId, payload);
  }
  await associationDeps.broadcastActiveProjectState(tabId);

  const message: RelayMessage = {
    type: "RELAY_SHOW_ASSOCIATION_TOAST",
    payload,
  };

  void chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

export async function archiveChatAssociation(
  tabId: number,
  projectId: string,
  sessionId: string,
  archived: boolean,
) {
  const state = getOrCreateTabState(tabId);
  const previousStatus = state.chatAssociation.status;
  const response = await relayFetch(`/api/projects/${projectId}/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorResponse(response, archived ? "Detach failed." : "Restore failed."),
    );
  }

  if (archived) {
    await removeApprovedAssociationBySession(sessionId);
    state.associationSuppressed = true;
    state.chatAssociation = {
      status: "archived",
      projectId,
      projectName: state.projectName,
      sessionId,
      reason: "This chat was detached from the project.",
      capturedAt: new Date().toISOString(),
    };
  } else {
    state.associationSuppressed = false;
    state.chatAssociation = {
      status: "saved",
      projectId,
      projectName: state.projectName,
      sessionId,
      reason: "This chat is currently saved to the project.",
      capturedAt: new Date().toISOString(),
    };
  }

  clearAssociationToast(state);

  invalidateProjectCache(projectId);
  await associationDeps.syncTabRemoteState(tabId, {
    force: true,
    reason: archived ? "chat_detached" : "chat_restored",
  });
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "association",
    event: "chat_association_updated",
    message: archived ? "Archived chat association." : "Restored chat association.",
    projectId,
    tabId,
    context: {
      sessionId,
      statusFrom: previousStatus,
      statusTo: archived ? "archived" : "saved",
      source: "sidebar",
    },
  });
}

export async function dismissCaptureReview(tabId: number) {
  const state = getOrCreateTabState(tabId);
  if (state.captureAbortController) {
    state.captureAbortController.abort();
    state.captureAbortController = undefined;
  }
  const chatKey = buildAssociationKey(state.page);
  const previousStatus = state.chatAssociation.status;
  clearPendingAssociation(state, { clearChatAssociation: true });
  clearAssociationToast(state);
  await rememberIgnoredChatKey(chatKey);
  state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
  state.associationSuppressed = true;
  state.routingReview = {
    confidence: "low",
    score: 0,
    reasons: ["You dismissed this chat from automatic project capture."]
  };
  state.chatAssociation = {
    status: "ignored",
    projectId: null,
    projectName: null,
    sessionId: null,
    reason: "Relay will ignore this chat until you manually associate it.",
    capturedAt: null,
  };
  await associationDeps.broadcastActiveProjectState(tabId);
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "association",
    event: "chat_association_updated",
    message: "Ignored chat association review.",
    tabId,
    context: {
      statusFrom: previousStatus,
      statusTo: "ignored",
      source: "review_dismissed",
    },
  });
}

export function shouldRequestAssociationAdjudication(decision: RelayRoutingDecision) {
  if (decision.confidence === "medium") {
    return true;
  }

  if (decision.confidence === "low") {
    const topScore = decision.topCandidates[0]?.score ?? 0;
    const secondScore = decision.topCandidates[1]?.score ?? 0;
    return topScore >= 16 || topScore - secondScore <= 10;
  }

  return false;
}

export function logRoutingDecision(
  stage: string,
  state: RelayTabState,
  decision: RelayRoutingDecision,
) {
  console.warn("[Relay BG] routing", {
    stage,
    mode: decision.mode,
    confidence: decision.confidence,
    candidateProjectId: decision.candidateProjectId,
    candidateProjectName: decision.candidateProjectName,
    score: decision.score,
    reasons: decision.reasons,
    diagnostics: decision.diagnostics,
    page: {
      title: state.page.title ?? null,
      pathname: state.page.pathname ?? null,
      turns: state.page.turns ?? 0,
      stable: state.page.isStable,
      streaming: state.page.isStreaming,
      signature: state.page.captureSignature?.slice(0, 16) ?? null,
    },
    topCandidates: decision.topCandidates.map((candidate) => ({
      projectId: candidate.projectId,
      projectName: candidate.projectName,
      score: candidate.score,
      reasons: candidate.reasons,
    })),
  });
}

export async function adjudicateAssociationRouting(
  state: RelayTabState,
  decision: RelayRoutingDecision,
) {
  const chatKey = buildAssociationKey(state.page);
  const captureSignature = state.page.captureSignature ?? null;
  const cached = await readAssociationAdjudication(chatKey, captureSignature);
  if (cached) {
    const cachedDecision = {
      mode: cached.decision,
      confidence: cached.confidence,
      candidateProjectId: cached.projectId,
      candidateProjectName:
        state.projectOptions.find((project) => project.id === cached.projectId)?.name ?? null,
      score: decision.score,
      reasons: cached.reasons,
      diagnostics: decision.diagnostics,
      topCandidates: decision.topCandidates,
    } satisfies RelayRoutingDecision;

    logRoutingDecision("adjudicated_cached", state, cachedDecision);
    return cachedDecision;
  }

  const response = await relayFetch("/api/extension/association", {
    method: "POST",
    body: JSON.stringify({
      title: state.page.title ?? null,
      recentUserTurnText: state.page.recentUserTurnText ?? null,
      recentRoutingText: state.page.recentRoutingText ?? null,
      fullVisibleRoutingText: state.page.fullVisibleRoutingText ?? null,
      heuristicMode: decision.mode,
      heuristicConfidence: decision.confidence,
      candidates: decision.topCandidates.map((candidate) => {
        const project = state.projectOptions.find((option) => option.id === candidate.projectId);
        return {
          projectId: candidate.projectId,
          name: candidate.projectName,
          description: project?.description ?? null,
          keywords: project?.routingContext?.keywords ?? [],
          heuristicScore: candidate.score,
          heuristicReasons: candidate.reasons,
        };
      }),
    }),
  });

  if (!response.ok) {
    return decision;
  }

  const payload = (await response.json()) as {
    result?: {
      decision: "auto-save" | "hold" | "ignore";
      candidateProjectId: string | null;
      candidateProjectName: string | null;
      confidence: "high" | "medium" | "low";
      reasons: string[];
    } | null;
  };
  const result = payload.result;
  if (!result) {
    return decision;
  }

  const topCandidateId = decision.topCandidates[0]?.projectId ?? null;
  const allowAutoSave =
    result.decision === "auto-save" &&
    decision.confidence !== "low" &&
    result.confidence === "high" &&
    Boolean(result.candidateProjectId) &&
    result.candidateProjectId === topCandidateId;

  const normalized: RelayRoutingDecision = {
    mode: allowAutoSave ? "auto-save" : result.decision === "ignore" ? "ignore" : "hold",
    confidence: result.confidence,
    candidateProjectId: allowAutoSave || result.decision === "hold" ? result.candidateProjectId : null,
    candidateProjectName: allowAutoSave || result.decision === "hold" ? result.candidateProjectName : null,
    score: decision.score,
    reasons: result.reasons.length ? result.reasons : decision.reasons,
    diagnostics: decision.diagnostics,
    topCandidates: decision.topCandidates,
  };

  logRoutingDecision("adjudicated", state, normalized);

  await rememberAssociationAdjudication({
    key: chatKey,
    captureSignature,
    projectId: normalized.candidateProjectId,
    decision: normalized.mode,
    confidence: normalized.confidence,
    reasons: normalized.reasons,
    adjudicatedAt: new Date().toISOString(),
  });

  return normalized;
}

export async function resolveAutoCaptureRouting(
  tabId: number,
  state: RelayTabState,
  approvedAssociationsInput?: Awaited<ReturnType<typeof readApprovedAssociations>>,
): Promise<RelayRoutingDecision> {
  const chatKey = buildAssociationKey(state.page);
  if (await isIgnoredChatKey(chatKey)) {
    return {
      mode: "ignore",
      confidence: "low",
      candidateProjectId: null,
      candidateProjectName: null,
      score: 0,
      reasons: ["This chat was already dismissed from automatic capture."],
      diagnostics: {
        phase: "none",
        scoreGap: 0,
        explicitNameSignal: false,
        wholeChatExactMention: false,
        highConfidenceEligible: false,
        signalCategories: [],
      },
      topCandidates: [],
    };
  }

  const approvedAssociations =
    approvedAssociationsInput ?? (await readApprovedAssociations());
  const heuristicDecision = evaluateProjectRouting({
    page: state.page,
    projects: state.projectOptions,
    selectedProjectId: state.projectId,
    lastTabProjectId: state.projectId,
    boundProject: state.boundProject,
    approvedAssociations
  });

  logRoutingDecision("heuristic", state, heuristicDecision);

  if (!shouldRequestAssociationAdjudication(heuristicDecision)) {
    return heuristicDecision;
  }

  try {
    return await adjudicateAssociationRouting(state, heuristicDecision);
  } catch (error) {
    console.warn("[Relay BG] association adjudication failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      candidateProjectId: heuristicDecision.candidateProjectId,
      candidateProjectName: heuristicDecision.candidateProjectName,
      score: heuristicDecision.score,
      diagnostics: heuristicDecision.diagnostics,
    });
    return heuristicDecision;
  }
}

export async function showSavingToast(
  tabId: number,
  projectId: string,
  projectName: string,
) {
  const state = getOrCreateTabState(tabId);
  const session = await getRelaySession();
  const { chatAssociation, toast } = buildSavingToast({
    projectId,
    projectName,
    projectOptions: state.projectOptions.length
      ? state.projectOptions
      : session.projectOptions,
  });

  clearPendingAssociation(state);
  state.lastRoutedSignature =
    state.page.captureSignature ?? buildAssociationKey(state.page);
  state.associationSuppressed = false;
  state.chatAssociation = chatAssociation;
  await showAssociationToast(tabId, toast);
}

export async function showAskToast(
  tabId: number,
  projectId: string,
  projectName: string,
) {
  const state = getOrCreateTabState(tabId);
  const session = await getRelaySession();
  const { chatAssociation, toast } = buildAskToast({
    projectId,
    projectName,
    projectOptions: state.projectOptions.length
      ? state.projectOptions
      : session.projectOptions,
    reason:
      state.routingReview?.reasons[0] ??
      "Relay wants confirmation before saving this chat to a project.",
  });

  state.lastRoutedSignature =
    state.page.captureSignature ?? buildAssociationKey(state.page);
  state.associationSuppressed = false;
  state.chatAssociation = chatAssociation;
  await showAssociationToast(tabId, toast);
}

export async function resolveAssociationToast(
  tabId: number,
  payload: {
    action: "approve" | "cancel";
    mode: "saving" | "ask";
    projectId: string;
  },
) {
  const state = getOrCreateTabState(tabId);

  const effect = resolveAssociationToastAction(payload);

  if (effect === "dismiss") {
    await dismissCaptureReview(tabId);
    return { ok: true, action: "dismissed" as const };
  }

  if (
    payload.mode === "ask" &&
    effect === "capture" &&
    state.chatAssociation.status === "held" &&
    state.chatAssociation.projectId === payload.projectId
  ) {
    return associationDeps.captureObservedChange(tabId, payload.projectId, {
      manualSelection: true,
      skipAssociationToast: false,
    });
  }

  return { ok: true, action: "noop" as const };
}

export async function archiveSessionQuietly(projectId: string, sessionId: string) {
  const response = await relayFetch(`/api/projects/${projectId}/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorResponse(response, "Failed to detach the previous chat association."),
    );
  }
}

export async function retargetAssociation(
  tabId: number,
  projectId: string,
  source: "toast" | "inline_chip" | "sidebar" = "sidebar",
) {
  const state = getOrCreateTabState(tabId);
  const session = await getRelaySession();
  const project = resolveAssociationProjectOption(state, session, projectId);
  if (!project) {
    return { ok: false, reason: "Choose a valid project first." };
  }

  // Retargeting the chat is an explicit association choice — drop any manual
  // override so it doesn't shadow the new association on the next re-sync.
  if (state.manualProjectChatKey) {
    await clearManualOverride(state.manualProjectChatKey);
  } else if (state.page.supported) {
    await clearManualOverride(buildAssociationKey(state.page));
  }
  state.manualProjectId = null;
  state.manualProjectChatKey = null;

  const previousState = {
    projectId: state.projectId,
    projectName: state.projectName,
    chatAssociation: state.chatAssociation,
    associationToast: state.associationToast,
    associationSuppressed: state.associationSuppressed,
    insertState: state.insertState,
  };

  if (
    state.chatAssociation.status === "saved" &&
    state.chatAssociation.projectId &&
    state.chatAssociation.sessionId &&
    state.chatAssociation.projectId !== project.projectId
  ) {
    const previousAssociation = state.chatAssociation;
    const previousAssociationProjectId = previousAssociation.projectId;
    const previousAssociationSessionId = previousAssociation.sessionId;
    state.projectId = project.projectId;
    state.projectName = project.projectName;
    state.chatAssociation = {
      status: "pending",
      projectId: project.projectId,
      projectName: project.projectName,
      sessionId: null,
      reason: `Moving this chat to ${project.projectName}…`,
      capturedAt: null,
    };
    await associationDeps.broadcastActiveProjectState(tabId);

    const result = await associationDeps.captureObservedChange(tabId, project.projectId, {
      manualSelection: false,
      skipAssociationToast: true,
    });

    if (!result?.ok) {
      state.projectId = previousState.projectId;
      state.projectName = previousState.projectName;
      state.chatAssociation = previousState.chatAssociation;
      state.associationToast = previousState.associationToast;
      state.associationSuppressed = previousState.associationSuppressed;
      state.insertState = previousState.insertState;
      if (previousAssociationProjectId) {
        await setSessionProjectTarget(
          previousAssociationProjectId,
          previousAssociation.projectName ??
            previousState.projectName ??
            project.projectName,
        );
      }
      await associationDeps.broadcastActiveProjectState(tabId);
      return result ?? { ok: false, reason: "Move failed." };
    }

    try {
      await archiveSessionQuietly(
        previousAssociationProjectId!,
        previousAssociationSessionId!,
      );
      await removeApprovedAssociationBySession(previousAssociationSessionId!);
    } catch (cause) {
      recordBackgroundTelemetry({
        level: "warn",
        surface: "extension-background",
        area: "association",
        event: "association.move_detach_failed",
        message:
          cause instanceof Error
            ? cause.message
            : "Failed to detach the previous saved association after moving the chat.",
        context: {
          fromProjectId: previousAssociation.projectId,
          toProjectId: project.projectId,
          source,
        },
      });
    }

    return {
      ok: true,
      moved: true,
      projectId: project.projectId,
      projectName: project.projectName,
      state: await buildActiveProjectState(tabId),
    };
  }

  updateAssociationProjectState(state, project.projectId, project.projectName);
  state.lastError = null;
  await associationDeps.broadcastActiveProjectState(tabId);
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "projects",
    event: "project_selected",
    message: `Moved chat association to ${project.projectName}.`,
    projectId: project.projectId,
    tabId,
    context: {
      source,
      projectName: project.projectName,
      associationAware: true,
    },
  });

  return {
    ok: true,
    projectId: project.projectId,
    projectName: project.projectName,
    state: await buildActiveProjectState(tabId),
  };
}
