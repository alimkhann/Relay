import { normalizeText } from "@relay/shared/utils/text";

import type { RelayInsertState, RelayPageState } from "../messaging/contracts";
import {
  getAllPersistedSignatures,
  removeTabSignature,
} from "../storage/capture-signatures";
import { buildAssociationKey } from "./routing";
import {
  createEmptyAssociationToast,
  createEmptyChatAssociation,
  createEmptyContextPreview,
  createEmptyInsertState,
  createEmptyTrustMetadata,
} from "./tab-state";
import type { PendingInsertedBriefState, RelayTabState } from "./bg-types";
import { rehydratedSignatures, tabStates } from "./state";

export async function rehydrateTabSignatures() {
  try {
    const signatures = await getAllPersistedSignatures();
    rehydratedSignatures.current = signatures;
    for (const [tabId, state] of tabStates.entries()) {
      const persisted = signatures[tabId];
      if (!persisted || state.lastCapturedSignature) continue;
      state.lastCapturedSignature = persisted.lastCapturedSignature;
      state.lastCapturedTurns = persisted.lastCapturedTurns;
      state.lastRoutedSignature = persisted.lastRoutedSignature;
      delete rehydratedSignatures.current[tabId];
    }
  } catch {
    rehydratedSignatures.current = {};
  }
}

export function createTabState(tabId: number): RelayTabState {
  return {
    tabId,
    page: { supported: false },
    projectId: null,
    projectName: null,
    projectOptions: [],
    trust: createEmptyTrustMetadata(),
    stateStatus: null,
    contextPreview: createEmptyContextPreview(),
    chatAssociation: createEmptyChatAssociation(),
    routingReview: null,
    boundProject: null,
    // Hidden until settings resolve — see createEmptyActiveProjectState.
    showCue: false,
    remoteStatus: "unavailable",
    lastSuccessfulSyncAt: null,
    lastError: null,
    retryDelayMs: 0,
    retryTimer: null,
    syncInFlight: false,
    syncQueued: false,
    syncRequestKey: null,
    lastSyncedRequestKey: null,
    lastSyncedProjectId: null,
    pendingSyncReason: null,
    capturePending: false,
    capturePendingAt: null,
    captureTimer: null,
    associationToast: createEmptyAssociationToast(),
    associationToastTimer: null,
    associationSuppressed: false,
    manualProjectId: null,
    manualProjectChatKey: null,
    insertState: createEmptyInsertState(),
    insertStateTimer: null,
    pendingInsertedBrief: null,
    lastObservedSignature: null,
    lastObservedTurns: 0,
    lastCapturedSignature: null,
    lastCapturedTurns: 0,
    lastRoutedSignature: null,
    lastReconciliation: null,
    lastBudgetStatus: null,
  };
}

export function getOrCreateTabState(tabId: number) {
  const existing = tabStates.get(tabId);
  if (existing) return existing;

  const state = createTabState(tabId);
  const persisted = rehydratedSignatures.current?.[tabId];
  if (persisted) {
    state.lastCapturedSignature = persisted.lastCapturedSignature;
    state.lastCapturedTurns = persisted.lastCapturedTurns;
    state.lastRoutedSignature = persisted.lastRoutedSignature;
    delete rehydratedSignatures.current![tabId];
  }
  tabStates.set(tabId, state);
  return state;
}

export function clearRetryTimer(state: RelayTabState) {
  if (!state.retryTimer) return;
  clearTimeout(state.retryTimer);
  state.retryTimer = null;
}

export function clearCaptureTimer(state: RelayTabState) {
  if (!state.captureTimer) return;
  clearTimeout(state.captureTimer);
  state.captureTimer = null;
}

export function abortInFlightCapture(state: RelayTabState) {
  if (!state.captureAbortController) return;
  state.captureAbortController.abort();
  state.captureAbortController = undefined;
}

export function clearAssociationToastTimer(state: RelayTabState) {
  if (!state.associationToastTimer) return;
  clearTimeout(state.associationToastTimer);
  state.associationToastTimer = null;
}

export function clearInsertStateTimer(state: RelayTabState) {
  if (!state.insertStateTimer) return;
  clearTimeout(state.insertStateTimer);
  state.insertStateTimer = null;
}

export function clearAssociationToast(state: RelayTabState) {
  clearAssociationToastTimer(state);
  state.associationToast = createEmptyAssociationToast();
}

export function clearPendingAssociation(
  state: RelayTabState,
  options: { clearChatAssociation?: boolean } = {},
) {
  if (state.associationToast.mode === "saving") clearAssociationToast(state);
  if (options.clearChatAssociation && state.chatAssociation.status === "pending") {
    state.chatAssociation = createEmptyChatAssociation();
  }
}

export function setInsertState(
  state: RelayTabState,
  input: {
    status: RelayInsertState["status"];
    source?: RelayInsertState["source"];
    message?: string | null;
  },
) {
  state.insertState = {
    status: input.status,
    source: input.source === undefined ? state.insertState.source : input.source,
    message: input.message ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function clearPendingInsertedBrief(state: RelayTabState) {
  state.pendingInsertedBrief = null;
}

function hashInsertedContent(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return String(hash);
}

export function buildPendingInsertedBriefState(input: {
  projectId: string;
  projectName: string;
  packetId: string | null;
  insertKind: "fresh_chat_bootstrap" | "quick_continuity";
  page: RelayPageState;
  content: string;
}) {
  const normalizedContent = normalizeText(input.content);
  const midpoint = Math.floor(normalizedContent.length / 2);
  const matchSnippets = [
    normalizedContent.slice(0, 140),
    normalizedContent.slice(Math.max(0, midpoint - 70), midpoint + 70),
    normalizedContent.slice(Math.max(0, normalizedContent.length - 140)),
  ]
    .map((snippet) => snippet.toLowerCase().trim())
    .filter(
      (snippet, index, snippets) =>
        snippet.length >= 40 && snippets.indexOf(snippet) === index,
    );
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    packetId: input.packetId,
    insertKind: input.insertKind,
    chatKey: buildAssociationKey(input.page),
    insertedAtSignature: input.page.captureSignature ?? null,
    insertedContent: normalizedContent,
    insertedContentHash: hashInsertedContent(normalizedContent),
    matchSnippet: matchSnippets[0] ?? normalizedContent.toLowerCase().slice(0, 140),
    matchSnippets,
    expiresAt: Date.now() + 15 * 60 * 1000,
  } satisfies PendingInsertedBriefState;
}

export function matchesPendingInsertedBrief(
  pending: PendingInsertedBriefState | null,
  page: RelayPageState,
) {
  if (!pending || Date.now() > pending.expiresAt) return false;
  const snippets = pending.matchSnippets.length
    ? pending.matchSnippets
    : [pending.matchSnippet].filter(Boolean);
  const haystack = normalizeText(
    page.fullVisibleRoutingText ?? page.recentUserTurnText ?? page.recentRoutingText ?? "",
  ).toLowerCase();
  return Boolean(haystack) && snippets.some((snippet) => haystack.includes(snippet));
}

export function capturedTurnsMatchPendingInsertedBrief(
  pending: PendingInsertedBriefState | null,
  turns: Array<{ role?: string; content?: string }>,
) {
  if (!pending || Date.now() > pending.expiresAt) return false;
  const snippets = pending.matchSnippets.length
    ? pending.matchSnippets
    : [pending.matchSnippet].filter(Boolean);
  return turns.some(
    (turn) =>
      turn.role === "user" &&
      snippets.some((snippet) =>
        normalizeText(turn.content ?? "").toLowerCase().includes(snippet),
      ),
  );
}

export function updateTabPageState(tabId: number, page: RelayPageState) {
  const state = getOrCreateTabState(tabId);
  const routeChanged = state.page.url !== page.url || state.page.pathname !== page.pathname;
  const savingSignatureChanged =
    state.page.captureSignature !== page.captureSignature &&
    state.associationToast.mode === "saving";
  const insertedSignatureChanged =
    state.page.captureSignature !== page.captureSignature &&
    Boolean(state.pendingInsertedBrief);

  state.page = page;
  state.lastObservedSignature = page.captureSignature ?? null;
  state.lastObservedTurns = page.turns ?? 0;

  if (savingSignatureChanged) {
    clearPendingAssociation(state, { clearChatAssociation: true });
    clearAssociationToast(state);
  }
  if (routeChanged) {
    abortInFlightCapture(state);
    state.lastError = null;
    state.capturePending = false;
    state.capturePendingAt = null;
    state.chatAssociation = createEmptyChatAssociation();
    state.routingReview = null;
    state.lastRoutedSignature = null;
    state.associationSuppressed = false;
    state.insertState = createEmptyInsertState();
    clearCaptureTimer(state);
    clearPendingAssociation(state);
    clearAssociationToast(state);
    clearPendingInsertedBrief(state);
  } else if (
    insertedSignatureChanged &&
    !matchesPendingInsertedBrief(state.pendingInsertedBrief, page)
  ) {
    clearPendingInsertedBrief(state);
  }
}

export function clearTabState(tabId: number) {
  const state = tabStates.get(tabId);
  if (!state) return;
  abortInFlightCapture(state);
  clearRetryTimer(state);
  clearCaptureTimer(state);
  clearAssociationToastTimer(state);
  clearInsertStateTimer(state);
  tabStates.delete(tabId);
  void removeTabSignature(tabId);
}
