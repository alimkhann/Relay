import { createFlowId } from "@relay/shared/utils/telemetry";
import { buildProjectContextPreview, getProjectContextCounts } from "@relay/shared/utils/project-context";
import { normalizeText, slugify } from "@relay/shared/utils/text";
import type {
  BillingStatusDto,
  ProjectDashboardDto,
  ProjectStateStatusDto,
  RelayOnboardingState,
  SupportedPlatform,
  UserEntitlementsDto,
} from "@relay/shared";

import type {
  RelayActiveProjectState,
  RelayAssociationTier,
  RelayAssociationToastPayload,
  RelayAssociationToastState,
  RelayChatAssociation,
  RelayContextPreview,
  RelayInsertState,
  RelayMessage,
  RelayPageState,
  RelayProjectOption,
  RelayRemoteStatus,
  RelayRoutingReview,
  RelayTrustMetadata,
} from "../messaging/contracts";
import {
  clearIgnoredChatKey,
  isIgnoredChatKey,
  readAssociationAdjudication,
  readApprovedAssociations,
  rememberAssociationAdjudication,
  rememberApprovedAssociation,
  rememberIgnoredChatKey,
  removeApprovedAssociationBySession,
} from "../storage/routing";
import {
  clearRelaySession,
  getRelaySession,
  resolveRelayApiBase,
  setRelaySession,
} from "../storage/session";
import { setRelayThemeMode, type RelayThemeMode } from "../storage/theme";
import { readRateLimitError, relayFetch } from "../utils/api";
import { resolveTargetProfile } from "../utils/target-profile";
import {
  buildSavedAssociationFromMemory,
  buildSavingToast,
  buildAskToast,
  buildDoneToast,
  getSavingToastMinimumDelayMs,
  resolveAssociationProjectName,
  resolveAssociationToastAction,
} from "./association-workflow";
import {
  buildAssociationKey,
  evaluateProjectRouting,
  findApprovedAssociationMatch,
  type RelayRoutingDecision,
  type RelayBoundProjectSignal,
} from "./routing";
import {
  createEmptyAssociationToast,
  createEmptyActiveProjectState,
  createEmptyChatAssociation,
  createEmptyContextPreview,
  createEmptyInsertState,
  createEmptyTrustMetadata,
  deriveRelayActiveProjectState,
  looksLikeFreshChatRoute,
  shouldScheduleAutoCapture,
  shouldScheduleAutoCaptureRouting,
  shouldScheduleIncrementalCapture,
} from "./tab-state";
import {
  flushBackgroundTelemetry,
  identifyExtensionUser,
  initializeBackgroundTelemetry,
  recordBackgroundTelemetry,
} from "./telemetry";
import {
  persistTabSignature,
  removeTabSignature,
  getAllPersistedSignatures,
  type TabCaptureSignature,
} from "../storage/capture-signatures";

interface RemoteSettingsPayload {
  settings: {
    autoCapture: boolean;
    defaultTargetProfileKey: string;
    showSidepanelOnSupportedSites?: boolean;
    autoCapturePrompt?: {
      eligible: boolean;
      dismissedAt: string | null;
      activatedAt: string | null;
    };
  };
}

interface RemoteSettingsResponsePayload {
  settings: { settings: RemoteSettingsPayload["settings"] };
  onboarding?: RelayOnboardingState;
}

interface ExtensionAuthSessionPayload {
  token: string;
  apiBase: string;
  userId?: string;
  projectId: string;
  projects?: RelayProjectOption[];
  onboarding?: RelayOnboardingState;
  settings?: { settings?: Partial<RemoteSettingsPayload["settings"]> };
}

type ProjectDashboardPayload = ProjectDashboardDto;

interface RelayTabState {
  tabId: number;
  page: RelayPageState;
  projectId: string | null;
  projectName: string | null;
  projectOptions: RelayProjectOption[];
  trust: RelayTrustMetadata;
  stateStatus: ProjectStateStatusDto | null;
  contextPreview: RelayContextPreview;
  chatAssociation: RelayChatAssociation;
  routingReview: RelayRoutingReview | null;
  boundProject: RelayBoundProjectSignal | null;
  showCue: boolean;
  remoteStatus: RelayRemoteStatus;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  retryDelayMs: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  syncInFlight: boolean;
  syncQueued: boolean;
  syncRequestKey: string | null;
  capturePending: boolean;
  captureTimer: ReturnType<typeof setTimeout> | null;
  associationToast: RelayAssociationToastState;
  associationToastTimer: ReturnType<typeof setTimeout> | null;
  associationSuppressed: boolean;
  insertState: RelayInsertState;
  insertStateTimer: ReturnType<typeof setTimeout> | null;
  pendingInsertedBrief: PendingInsertedBriefState | null;
  lastObservedSignature: string | null;
  lastObservedTurns: number;
  lastCapturedSignature: string | null;
  lastCapturedTurns: number;
  lastRoutedSignature: string | null;
  lastReconciliation: { archivedCount: number; archivedItems: string[] } | null;
  lastBudgetStatus: { aiUsed: number; aiLimit: number; aiRemaining: number; plan: string } | null;
}

interface PendingInsertedBriefState {
  projectId: string;
  projectName: string;
  chatKey: string | null;
  insertedAtSignature: string | null;
  matchSnippet: string;
  expiresAt: number;
}

const tabStates = new Map<number, RelayTabState>();

// ── Drain scheduler ──────────────────────────────────────────────
// When a capture returns digestStrategy === "deferred", we schedule
// a drain call after DRAIN_DELAY_MS to batch-process deferred jobs.
const DRAIN_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_DRAIN_DELAY_MS = 15_000;
const pendingDrainProjects = new Set<string>();
let drainTimerId: ReturnType<typeof setTimeout> | null = null;
let drainInFlight = false;
let scheduledDrainDelayMs: number | null = null;

function scheduleDrain(projectId: string, delayMs = DRAIN_DELAY_MS) {
  pendingDrainProjects.add(projectId);
  if (drainInFlight) return;

  if (drainTimerId !== null) {
    if (scheduledDrainDelayMs !== null && scheduledDrainDelayMs <= delayMs) {
      return;
    }

    clearTimeout(drainTimerId);
    drainTimerId = null;
  }

  scheduledDrainDelayMs = delayMs;
  drainTimerId = setTimeout(async () => {
    drainTimerId = null;
    scheduledDrainDelayMs = null;
    drainInFlight = true;
    try {
      const projects = [...pendingDrainProjects];
      pendingDrainProjects.clear();
      for (const pid of projects) {
        try {
          await relayFetch(`/api/projects/${pid}/drain`, { method: "POST" });
        } catch { /* non-fatal */ }
      }
    } finally {
      drainInFlight = false;
      // If more deferred captures arrived during drain, restart timer
      if (pendingDrainProjects.size > 0) {
        const next = [...pendingDrainProjects];
        pendingDrainProjects.clear();
        for (const pid of next) scheduleDrain(pid, DRAIN_DELAY_MS);
      }
    }
  }, delayMs);
}

/**
 * In-memory cache of persisted capture signatures, loaded from
 * chrome.storage.session on worker wake. Consumed once per tab
 * in getOrCreateTabState() to restore dedup state after MV3
 * service worker suspension.
 */
let rehydratedSignatures: Record<number, TabCaptureSignature> | null = null;

void getAllPersistedSignatures()
  .then((sigs: Record<number, TabCaptureSignature>) => { rehydratedSignatures = sigs; })
  .catch(() => { rehydratedSignatures = {}; });
const dashboardCache = new Map<
  string,
  { dashboard: ProjectDashboardPayload | null; fetchedAt: number }
>();
let sessionDataCache: {
  token: string;
  data: {
    connected: boolean;
    projects: RelayProjectOption[];
    settings: RemoteSettingsPayload | null;
    onboarding: RelayOnboardingState;
    entitlements: UserEntitlementsDto | null;
  };
  fetchedAt: number;
} | null = null;

let authGraceUntil = 0;
const SESSION_CACHE_TTL_MS = 15_000;
const DASHBOARD_CACHE_TTL_MS = 20_000;
const REMOTE_RETRY_DELAY_MS = 300;
// Exponential backoff schedule between retry attempts (3x growth).
// 4 attempts total: initial + 3 retries at 300ms, 900ms, 2700ms.
const REMOTE_RETRY_BACKOFF_MS = [300, 900, 2_700];
const REMOTE_RETRY_MAX_ATTEMPTS = 4;

initializeBackgroundTelemetry();

function formatUpdatedLabel(value: string | null | undefined) {
  if (!value) return null;

  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;

  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes <= 1) return "a moment ago";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CAPTURE_TAB_MESSAGE_TIMEOUT_MS = 8_000;
const AUTO_CAPTURE_GRACE_MS = 400;
const CAPTURE_API_TIMEOUT_MS = 70_000;

async function sendTabMessageWithTimeout<T>(
  tabId: number,
  message: RelayMessage,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return await Promise.race([
    chrome.tabs.sendMessage(tabId, message) as Promise<T>,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    }),
  ]);
}

function createOAuthNonce() {
  return crypto.randomUUID();
}

async function requestGoogleIdentityTokens(input: {
  interactive: boolean;
  prompt: "none" | "select_account";
}) {
  const googleClientId = process.env.PLASMO_PUBLIC_CRX_GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new Error("Google sign-in is not configured (missing client ID).");
  }

  const redirectUrl = chrome.identity.getRedirectURL();
  const state = createOAuthNonce();
  const nonce = createOAuthNonce();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", googleClientId);
  authUrl.searchParams.set("redirect_uri", redirectUrl);
  authUrl.searchParams.set("response_type", "token id_token");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("prompt", input.prompt);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("state", state);

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: input.interactive,
    });

  if (!callbackUrl) {
    throw new Error("Google sign-in was cancelled.");
  }

  const hashParams = new URLSearchParams(new URL(callbackUrl).hash.slice(1));
  const callbackState = hashParams.get("state");
  if (callbackState !== state) {
    throw new Error("Google sign-in returned an invalid state.");
  }

  const accessToken = hashParams.get("access_token");
  const idToken = hashParams.get("id_token");
  if (!accessToken || !idToken) {
    throw new Error("Google sign-in did not return the required tokens.");
  }

  return {
    accessToken,
    idToken,
  };
}

function createPendingOnboardingState(): RelayOnboardingState {
  return {
    status: "pending",
    completedProjectId: null,
    completedVia: null,
    completedAt: null,
  };
}

function isAuthFailureMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("authentication is required") ||
    normalized.includes("account not found") ||
    normalized.includes("user not found") ||
    normalized.includes("deleted account") ||
    normalized.includes("invalid session")
  );
}

async function resetStoredSession(reason: string) {
  const session = await getRelaySession();
  sessionDataCache = null;
  await clearRelaySession();
  await setRelaySession({
    apiBase: resolveRelayApiBase({ storedApiBase: session.apiBase }),
    connected: false,
    token: "",
    projectId: "",
    assumedProjectId: "",
    assumedProjectName: "",
    projectOptions: [],
    lastStatus: reason,
    onboarding: createPendingOnboardingState(),
  });
}

async function storeAuthenticatedExtensionSession(
  payload: ExtensionAuthSessionPayload,
  lastStatus: string,
) {
  sessionDataCache = null;
  await setRelaySession({
    apiBase: payload.apiBase,
    token: payload.token,
    userId: payload.userId ?? "",
    projectId: payload.projectId,
    targetMode: "auto",
    targetProfileKey: "",
    resolvedTargetProfileKey: "",
    connected: true,
    autoCapture: payload.settings?.settings?.autoCapture ?? true,
    autoCapturePrompt: payload.settings?.settings?.autoCapturePrompt ?? {
      eligible: false,
      dismissedAt: null,
      activatedAt: null,
    },
    limitedMode: false,
    lastStatus,
    stateStatus: null,
    assumedProjectId: payload.projectId,
    assumedProjectName: "",
    trust: createEmptyTrustMetadata(),
    projectOptions: payload.projects ?? [],
    onboarding: payload.onboarding ?? createPendingOnboardingState(),
  });
}

async function retryRemote<T>(
  task: () => Promise<T>,
  attempts = REMOTE_RETRY_MAX_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await task();
    } catch (cause) {
      lastError = cause;
      if (index < attempts - 1) {
        const delay =
          REMOTE_RETRY_BACKOFF_MS[index] ??
          REMOTE_RETRY_BACKOFF_MS[REMOTE_RETRY_BACKOFF_MS.length - 1] ??
          REMOTE_RETRY_DELAY_MS;
        await wait(delay);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Relay remote request failed.");
}

function buildTrustMetadata(
  dashboard: ProjectDashboardPayload | null | undefined,
): RelayTrustMetadata {
  const timestampCandidates = [
    dashboard?.projectState?.updatedAt ?? null,
    dashboard?.stateStatus?.lastDigestAt ?? null,
    dashboard?.packets?.[0]?.createdAt ?? null,
  ].filter(Boolean) as string[];
  const updatedAt =
    timestampCandidates.sort(
      (left, right) => new Date(right).getTime() - new Date(left).getTime(),
    )[0] ?? null;

  const savedContextCount = dashboard ? getProjectContextCounts(dashboard).all : 0;

  return {
    updatedAt,
    updatedLabel: formatUpdatedLabel(updatedAt),
    recentChatCount: dashboard?.distinctConversationCount ?? 0,
    savedContextCount,
  };
}

function buildDashboardContextPreview(
  dashboard: ProjectDashboardPayload | null | undefined,
): RelayContextPreview {
  if (!dashboard) {
    return createEmptyContextPreview();
  }

  const base = buildProjectContextPreview(dashboard);
  const notes = (dashboard.memory ?? [])
    .filter((item) => item.type === "note" && item.pinned)
    .sort((a, b) => {
      const aTime = a.capturedAt ?? a.updatedAt;
      const bTime = b.capturedAt ?? b.updatedAt;
      return bTime.localeCompare(aTime);
    })
    .slice(0, 5)
    .map((item) => {
      let hostname: string | null = null;
      if (item.sourceUrl) {
        try {
          hostname = new URL(item.sourceUrl).hostname.replace(/^www\./, "");
        } catch {
          hostname = null;
        }
      }
      return {
        key: `note:${item.id}`,
        memoryId: item.id,
        text: item.content,
        sourceUrl: item.sourceUrl,
        hostname,
        capturedAt: item.capturedAt ?? item.updatedAt,
      };
    });

  return {
    ...base,
    notes,
  };
}

function findMatchingSession(
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

function buildSavedChatAssociation(
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

function getRetargetableAssociationProject(state: RelayTabState) {
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

function findProjectOption(
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

function resolveAssociationProjectOption(
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

function updateAssociationProjectState(
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

async function setSessionProjectTarget(
  projectId: string,
  projectName: string,
) {
  await setRelaySession({
    projectId,
    assumedProjectId: projectId,
    assumedProjectName: projectName,
  });
}

async function setEffectiveProjectTarget(
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

function hydrateTabStateFromSession(state: RelayTabState, session: Awaited<ReturnType<typeof getRelaySession>>) {
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

function createTabState(tabId: number): RelayTabState {
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
    showCue: true,
    remoteStatus: "unavailable",
    lastSuccessfulSyncAt: null,
    lastError: null,
    retryDelayMs: 0,
    retryTimer: null,
    syncInFlight: false,
    syncQueued: false,
    syncRequestKey: null,
    capturePending: false,
    captureTimer: null,
    associationToast: createEmptyAssociationToast(),
    associationToastTimer: null,
    associationSuppressed: false,
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

function getOrCreateTabState(tabId: number) {
  const existing = tabStates.get(tabId);
  if (existing) return existing;

  const nextState = createTabState(tabId);

  // Rehydrate capture signatures from chrome.storage.session
  // to survive MV3 service worker suspension
  if (rehydratedSignatures) {
    const persisted = rehydratedSignatures[tabId];
    if (persisted) {
      nextState.lastCapturedSignature = persisted.lastCapturedSignature;
      nextState.lastCapturedTurns = persisted.lastCapturedTurns;
      nextState.lastRoutedSignature = persisted.lastRoutedSignature;
      delete rehydratedSignatures[tabId]; // consume once
    }
  }

  tabStates.set(tabId, nextState);
  return nextState;
}

function clearRetryTimer(state: RelayTabState) {
  if (state.retryTimer) {
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
  }
}

function clearCaptureTimer(state: RelayTabState) {
  if (state.captureTimer) {
    clearTimeout(state.captureTimer);
    state.captureTimer = null;
  }
}

function clearAssociationToastTimer(state: RelayTabState) {
  if (state.associationToastTimer) {
    clearTimeout(state.associationToastTimer);
    state.associationToastTimer = null;
  }
}

function clearInsertStateTimer(state: RelayTabState) {
  if (state.insertStateTimer) {
    clearTimeout(state.insertStateTimer);
    state.insertStateTimer = null;
  }
}

function clearPendingAssociation(
  state: RelayTabState,
  options: { clearChatAssociation?: boolean } = {},
) {
  if (state.associationToast.mode === "saving") {
    clearAssociationToast(state);
  }
  if (options.clearChatAssociation && state.chatAssociation.status === "pending") {
    state.chatAssociation = createEmptyChatAssociation();
  }
}

function clearAssociationToast(state: RelayTabState) {
  clearAssociationToastTimer(state);
  state.associationToast = createEmptyAssociationToast();
}

function setInsertState(
  state: RelayTabState,
  input: {
    status: RelayInsertState["status"];
    source?: RelayInsertState["source"];
    message?: string | null;
  },
) {
  state.insertState = {
    status: input.status,
    source:
      input.source === undefined ? state.insertState.source : input.source,
    message: input.message ?? null,
    updatedAt: new Date().toISOString(),
  };
}

function clearPendingInsertedBrief(state: RelayTabState) {
  state.pendingInsertedBrief = null;
}

function buildPendingInsertedBriefState(input: {
  projectId: string;
  projectName: string;
  page: RelayPageState;
  content: string;
}) {
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    chatKey: buildAssociationKey(input.page),
    insertedAtSignature: input.page.captureSignature ?? null,
    matchSnippet: normalizeText(input.content).toLowerCase().slice(0, 140),
    expiresAt: Date.now() + 15 * 60 * 1000,
  } satisfies PendingInsertedBriefState;
}

function matchesPendingInsertedBrief(
  pending: PendingInsertedBriefState | null,
  page: RelayPageState,
) {
  if (!pending || Date.now() > pending.expiresAt) {
    return false;
  }

  if (!pending.matchSnippet) {
    return false;
  }

  const haystack = normalizeText(
    page.fullVisibleRoutingText ??
      page.recentUserTurnText ??
      page.recentRoutingText ??
      "",
  )
    .toLowerCase();

  if (!haystack) {
    return false;
  }

  return haystack.includes(pending.matchSnippet);
}

function scheduleInsertStateReset(tabId: number, delayMs = 1200) {
  const state = getOrCreateTabState(tabId);
  clearInsertStateTimer(state);
  state.insertStateTimer = setTimeout(() => {
    state.insertStateTimer = null;
    const latestState = getOrCreateTabState(tabId);
    latestState.insertState = createEmptyInsertState();
    void broadcastActiveProjectState(tabId);
  }, delayMs);
}

function setAssociationToastState(
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
  };
}

async function clearAssociationToastForTab(tabId: number) {
  const state = getOrCreateTabState(tabId);
  if (!state.associationToast.visible) {
    return;
  }

  clearAssociationToast(state);
  await broadcastActiveProjectState(tabId);
}

function scheduleAssociationToastExpiry(
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

function describeApprovedAssociationReason(
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

function restoreApprovedAssociationState(
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

function clearTabState(tabId: number) {
  const state = tabStates.get(tabId);
  if (!state) return;

  clearRetryTimer(state);
  clearCaptureTimer(state);
  clearAssociationToastTimer(state);
  clearInsertStateTimer(state);
  tabStates.delete(tabId);

  // Clean up persisted signatures when tab closes
  void removeTabSignature(tabId);
}

async function readErrorResponse(response: Response, fallback: string) {
  try {
    const text = await response.text();

    if (!text.trim()) {
      return `${fallback} (HTTP ${response.status})`;
    }

    try {
      const payload = JSON.parse(text) as {
        error?: string;
        message?: string;
      };
      return payload.error ?? payload.message ?? `${fallback} (HTTP ${response.status})`;
    } catch {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 180);
      return snippet
        ? `${fallback} (HTTP ${response.status}): ${snippet}`
        : `${fallback} (HTTP ${response.status})`;
    }
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

async function loadSessionData() {
  const session = await getRelaySession();
  if (!session.token) {
    sessionDataCache = null;
    return {
      connected: false,
      projects: [] as RelayProjectOption[],
      settings: null as RemoteSettingsPayload | null,
      onboarding: createPendingOnboardingState(),
      entitlements: null as UserEntitlementsDto | null,
    };
  }

  if (
    sessionDataCache &&
    sessionDataCache.token === session.token &&
    Date.now() - sessionDataCache.fetchedAt < SESSION_CACHE_TTL_MS
  ) {
    return sessionDataCache.data;
  }

  try {
    // Fetch session + billing in parallel. Billing is a nice-to-have — if it
    // fails the side panel still renders, it just assumes free until the next
    // refresh cycle.
    const [sessionResponse, billingResponse] = await Promise.all([
      retryRemote(() => relayFetch("/api/extension/session")),
      relayFetch("/api/billing/status").catch(() => null),
    ]);

    if (!sessionResponse.ok) {
      const message = await readErrorResponse(
        sessionResponse,
        "Failed to load extension session.",
      );
      if (
        sessionResponse.status === 401 ||
        sessionResponse.status === 403 ||
        isAuthFailureMessage(message)
      ) {
        if (Date.now() < authGraceUntil) {
          console.log("[Relay BG] auth grace period active, skipping session reset after", sessionResponse.status);
          return {
            connected: session.connected,
            projects: session.projectOptions,
            settings: null as RemoteSettingsPayload | null,
            onboarding: session.onboarding ?? createPendingOnboardingState(),
            entitlements: null as UserEntitlementsDto | null,
          };
        }
        await resetStoredSession(message);
        return {
          connected: false,
          projects: [] as RelayProjectOption[],
          settings: null as RemoteSettingsPayload | null,
          onboarding: createPendingOnboardingState(),
          entitlements: null as UserEntitlementsDto | null,
        };
      }

      throw new Error(message);
    }

    const sessionPayload = (await sessionResponse.json()) as {
      userId: string;
      projects: Array<{
        id: string;
        name: string;
        slug?: string | null;
        description?: string | null;
        memoryCount?: number;
        sessionCount?: number;
        routingContext?: {
          hasMeaningfulContext: boolean;
          keywords: string[];
        } | null;
      }>;
      settings: RemoteSettingsResponsePayload["settings"];
      onboarding?: RelayOnboardingState | null;
    };
    const settingsPayload = {
      settings: sessionPayload.settings,
      onboarding: sessionPayload.onboarding,
    } as RemoteSettingsResponsePayload;
    const onboarding = settingsPayload.onboarding ?? createPendingOnboardingState();

    const projects = sessionPayload.projects.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug ?? null,
      description: project.description ?? null,
      memoryCount: project.memoryCount ?? 0,
      sessionCount: project.sessionCount ?? 0,
      routingContext: project.routingContext ?? null,
    }));
    if (projects.length === 0) {
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "onboarding",
        event: "session.no_projects",
        message: "Loaded an authenticated extension session with no projects yet.",
      });
    }
    const nextProjectId =
      onboarding.status === "completed"
        ? session.projectId &&
          projects.some((project) => project.id === session.projectId)
          ? session.projectId
          : onboarding.completedProjectId &&
              projects.some((project) => project.id === onboarding.completedProjectId)
            ? onboarding.completedProjectId
            : (projects[0]?.id ?? "")
        : "";

    await setRelaySession({
      connected: true,
      userId: sessionPayload.userId,
      projectId: nextProjectId,
      autoCapture: settingsPayload.settings.settings.autoCapture,
      autoCapturePrompt: settingsPayload.settings.settings.autoCapturePrompt ?? {
        eligible: false,
        dismissedAt: null,
        activatedAt: null,
      },
      targetMode: session.targetMode ?? "auto",
      targetProfileKey:
        session.targetMode === "manual" ? session.targetProfileKey : "",
      projectOptions: projects,
      onboarding,
    });
    await identifyExtensionUser(sessionPayload.userId);

    recordBackgroundTelemetry({
      level: "info",
      surface: "extension-background",
      area: "session",
      event: "extension_session_refreshed",
      message: "Refreshed extension session state from Relay.",
      userId: sessionPayload.userId,
      projectId: nextProjectId || null,
      context: {
        connected: true,
        projectCount: projects.length,
        onboardingStatus: onboarding.status,
      },
    });

    let entitlements: UserEntitlementsDto | null = null;
    if (billingResponse && billingResponse.ok) {
      try {
        const billingPayload = (await billingResponse.json()) as { billing: BillingStatusDto };
        entitlements = billingPayload.billing?.entitlements ?? null;
      } catch {
        entitlements = null;
      }
    }

    const data = {
      connected: true,
      projects,
      settings: settingsPayload.settings,
      onboarding,
      entitlements,
    };

    sessionDataCache = {
      token: session.token,
      data,
      fetchedAt: Date.now(),
    };

    return data;
  } catch (cause) {
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "session",
      event: "session.refresh_failed",
      message: "Failed to refresh extension session data from the Relay API.",
      error: cause,
    });
    if (sessionDataCache && sessionDataCache.token === session.token) {
      return sessionDataCache.data;
    }

    throw cause;
  }
}

function invalidateProjectCache(projectId: string | null | undefined) {
  if (!projectId) return;
  dashboardCache.delete(projectId);
}

async function fetchProjectDashboard(projectId: string) {
  const cached = dashboardCache.get(projectId);
  if (cached && Date.now() - cached.fetchedAt < DASHBOARD_CACHE_TTL_MS) {
    return cached.dashboard;
  }

  try {
    const response = await retryRemote(() =>
      relayFetch(`/api/projects/${projectId}`),
    );
    if (!response.ok) {
      return cached?.dashboard ?? null;
    }

    const payload = (await response.json()) as {
      dashboard?: ProjectDashboardPayload;
    };
    const dashboard = payload.dashboard ?? null;
    dashboardCache.set(projectId, { dashboard, fetchedAt: Date.now() });
    return dashboard;
  } catch {
    return cached?.dashboard ?? null;
  }
}

async function resolveBoundProject(tabId: number, pageState: RelayPageState) {
  if (!pageState.supported) return null;

  const query = new URLSearchParams();
  if (pageState.domain) query.set("domain", pageState.domain);
  if (pageState.platform) query.set("platform", pageState.platform);
  query.set("tabId", String(tabId));

  const response = await retryRemote(() =>
    relayFetch(`/api/extension/bindings?${query.toString()}`),
  );
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    binding?: {
      binding: {
        id: string;
        bindingKind: "tab" | "domain" | "manual";
        domain: string | null;
        tabId: string | null;
        platform: RelayPageState["platform"] | null;
        updatedAt: string;
      };
      project: {
        id: string;
        name: string;
        slug?: string | null;
      };
    } | null;
  };

  return payload.binding ?? null;
}

async function resolveActiveProject(
  tabId: number,
  pageState: RelayPageState,
  preferredProjectId?: string | null,
) {
  const session = await getRelaySession();
  const remote = await loadSessionData();
  const bound = remote.connected
    ? await resolveBoundProject(tabId, pageState)
    : null;
  const preferredProject =
    preferredProjectId
      ? remote.projects.find((project) => project.id === preferredProjectId) ?? null
      : null;
  const fallbackProject =
    remote.onboarding.status === "completed"
      ? remote.projects.find((project) => project.id === session.projectId) ??
        remote.projects[0] ??
        null
      : null;
  const activeProject =
    remote.onboarding.status === "completed"
      ? preferredProject ?? bound?.project ?? fallbackProject
      : null;

  return {
    connected: remote.connected,
    projects: remote.projects,
    settings: remote.settings,
    onboarding: remote.onboarding,
    activeProject,
    boundProject: bound
      ? {
          projectId: bound.project.id,
          bindingKind: bound.binding.bindingKind,
        }
      : null,
  };
}

async function rememberProjectSelection(
  projectId: string,
  tabId: number | null,
  pageState: RelayPageState,
  projectName?: string | null,
) {
  const updates = [
    relayFetch("/api/extension/bindings", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        bindingKind: "manual",
        platform: pageState.platform ?? null,
      }),
    }),
  ];

  if (tabId !== null) {
    updates.push(
      relayFetch("/api/extension/bindings", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          bindingKind: "tab",
          tabId: String(tabId),
          platform: pageState.platform ?? null,
        }),
      }),
    );
  }

  if (pageState.domain) {
    updates.push(
      relayFetch("/api/extension/bindings", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          bindingKind: "domain",
          domain: pageState.domain,
          platform: pageState.platform ?? null,
        }),
      }),
    );
  }

  await Promise.allSettled(updates);
  await setRelaySession({
    projectId,
    assumedProjectId: projectId,
    assumedProjectName: projectName ?? "",
  });
}

function detectPlatformFromTabUrl(url: string): string | null {
  if (/codex\.openai\.com/.test(url) || /chatgpt\.com\/codex|chat\.openai\.com\/codex/.test(url)) return "codex";
  if (/chatgpt\.com|chat\.openai\.com/.test(url)) return "chatgpt";
  if (/claude\.ai/.test(url)) return "claude";
  if (/perplexity\.ai/.test(url)) return "perplexity";
  if (/gemini\.google\.com|aistudio\.google\.com/.test(url)) return "gemini";
  if (/grok\.com|x\.com\/i\/grok/.test(url)) return "grok";
  if (/chat\.deepseek\.com/.test(url)) return "deepseek";
  return null;
}

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !detectPlatformFromTabUrl(tab.url)) return;

    // Try injecting the content script programmatically. If it was already
    // injected declaratively this is a no-op (the IIFE guards with mounted flag).
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        // Use the content script entry from the manifest
        ...((chrome.runtime.getManifest().content_scripts?.[0]?.js as string[]) ?? []),
      ],
    });
  } catch {
    // Injection can fail if the tab is a special page or was closed
  }
}

async function requestPageStateFromTab(tabId: number) {
  const attempt = async (): Promise<RelayPageState> => {
    try {
      return ((await chrome.tabs.sendMessage(tabId, {
        type: "RELAY_PAGE_STATE",
      })) as RelayPageState | undefined) ?? { supported: false };
    } catch {
      return { supported: false };
    }
  };

  let page = await attempt();

  // If declarative content script didn't respond, try programmatic injection
  // then retry. This handles cases where Chrome didn't inject the content
  // script for unknown reasons (observed on Perplexity).
  if (!page.supported) {
    await ensureContentScriptInjected(tabId);
    await new Promise((r) => setTimeout(r, 300));
    page = await attempt();
  }

  // Last resort: use tab URL to provide a minimal supported state
  if (!page.supported) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url) {
        const platform = detectPlatformFromTabUrl(tab.url);
        if (platform) {
          const parsedUrl = new URL(tab.url);
          page = {
            supported: true,
            platform,
            routeKind: "chat",
            title: tab.title ?? null,
            url: tab.url,
            domain: parsedUrl.hostname,
            pathname: parsedUrl.pathname,
            pageFingerprint: parsedUrl.pathname.split("/").pop() ?? null,
            turns: 0,
            promptReady: false,
            isFreshRoute: false,
            isFreshChat: false,
            isStable: false,
            isStreaming: false,
          };
        }
      }
    } catch {
      // tabs.get can fail if tab was closed
    }
  }

  updateTabPageState(tabId, page);
  return page;
}

async function buildActiveProjectState(
  tabId: number,
): Promise<RelayActiveProjectState> {
  const session = await getRelaySession();
  const state = tabStates.get(tabId);

  if (!state) {
    return createEmptyActiveProjectState();
  }

  const associationProject = getRetargetableAssociationProject(state);
  const onboarding = session.onboarding ?? createPendingOnboardingState();
  const effectiveProjectId =
    onboarding.status === "completed"
      ? associationProject?.projectId ??
        state.projectId ??
        (session.assumedProjectId || null)
      : null;
  const effectiveProjectName =
    onboarding.status === "completed"
      ? associationProject?.projectName ??
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
    entitlements: sessionDataCache?.data.entitlements ?? null,
  });
}

async function broadcastActiveProjectState(tabId: number) {
  const state = await buildActiveProjectState(tabId);
  const message: RelayMessage = {
    type: "RELAY_ACTIVE_PROJECT_STATE_CHANGED",
    payload: { tabId, state },
  };

  void chrome.runtime.sendMessage(message).catch(() => undefined);
  void chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

async function broadcastThemeChange(theme: RelayThemeMode) {
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

async function broadcastUserSettingsChange(
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

function scheduleRetry(tabId: number) {
  const state = getOrCreateTabState(tabId);
  if (state.retryTimer) return;

  const nextDelay =
    state.retryDelayMs === 0
      ? (REMOTE_RETRY_BACKOFF_MS[0] ?? 5_000)
      : (REMOTE_RETRY_BACKOFF_MS[1] ?? 15_000);

  state.retryDelayMs = nextDelay;
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    void syncTabRemoteState(tabId, { force: true, reason: "retry" });
  }, nextDelay);
}

async function syncTabRemoteState(
  tabId: number,
  options: { force?: boolean; reason?: string } = {},
) {
  const state = getOrCreateTabState(tabId);
  const session = await getRelaySession();
  hydrateTabStateFromSession(state, session);
  const requestKey = `${state.page.url ?? ""}|${state.page.captureSignature ?? ""}|${state.page.turns ?? 0}`;

  if (!session.token) {
    state.remoteStatus = "unavailable";
    state.lastError = null;
    state.projectOptions = [];
    state.projectId = null;
    state.projectName = null;
    state.stateStatus = null;
    await broadcastActiveProjectState(tabId);
    return;
  }

  if (state.syncInFlight) {
    state.syncQueued = true;
    return;
  }

  const shouldSkip =
    !options.force &&
    state.remoteStatus === "ready" &&
    state.lastSuccessfulSyncAt &&
    Date.now() - new Date(state.lastSuccessfulSyncAt).getTime() < 4_000;

  if (shouldSkip) {
    return;
  }

  state.syncInFlight = true;
  state.syncQueued = false;
  state.syncRequestKey = requestKey;
  state.remoteStatus =
    state.lastSuccessfulSyncAt || session.projectOptions.length > 0 || session.assumedProjectId
      ? "stale"
      : "loading";
  await broadcastActiveProjectState(tabId);

  try {
    const approvedAssociations = state.page.supported
      ? await readApprovedAssociations()
      : [];
    const rememberedAssociation = findApprovedAssociationMatch(
      state.page,
      approvedAssociations,
    );
    const preferredProjectId =
      getRetargetableAssociationProject(state)?.projectId ??
      rememberedAssociation?.projectId ??
      null;
    const { connected, projects, activeProject, settings, boundProject, onboarding } =
      await resolveActiveProject(tabId, state.page, preferredProjectId);
    const dashboard = activeProject
      ? await fetchProjectDashboard(activeProject.id)
      : null;
    const trust = dashboard ? buildTrustMetadata(dashboard) : state.trust;
    const contextPreview = buildDashboardContextPreview(dashboard);
    const nextStateStatus =
      dashboard?.stateStatus ??
      state.stateStatus ??
      session.stateStatus ??
      null;
    const dashboardChatAssociation = buildSavedChatAssociation(
      state.page,
      activeProject,
      dashboard,
    );
    const currentRequestKey = `${state.page.url ?? ""}|${state.page.captureSignature ?? ""}|${state.page.turns ?? 0}`;
    if (currentRequestKey !== requestKey) {
      state.syncQueued = true;
      return;
    }
    const nextChatAssociation =
      dashboardChatAssociation.status !== "none"
        ? dashboardChatAssociation
        : rememberedAssociation?.projectId && rememberedAssociation.projectName
          ? buildSavedAssociationFromMemory({
              projectId: rememberedAssociation.projectId,
              projectName: rememberedAssociation.projectName,
              sessionId: rememberedAssociation.sessionId,
              approvedAt: rememberedAssociation.approvedAt,
            })
          : createEmptyChatAssociation();

    state.projectOptions = projects;
    state.projectId = activeProject?.id ?? null;
    state.projectName = activeProject?.name ?? null;
    state.boundProject = boundProject;
    state.showCue = settings?.settings.showSidepanelOnSupportedSites ?? true;
    state.trust = trust;
    state.stateStatus = nextStateStatus;
    state.contextPreview = contextPreview;
    const previousAssociationStatus = state.chatAssociation.status;
    if (nextChatAssociation.status !== "none") {
      state.chatAssociation = nextChatAssociation;
    } else if (
      state.chatAssociation.status !== "held" &&
      state.chatAssociation.status !== "ignored" &&
      state.chatAssociation.status !== "pending" &&
      state.chatAssociation.status !== "archived" &&
      state.chatAssociation.status !== "saved"
    ) {
      state.chatAssociation = createEmptyChatAssociation();
    }

    state.remoteStatus = connected ? "ready" : "unavailable";
    state.lastSuccessfulSyncAt = new Date().toISOString();
    state.lastError = null;
    state.retryDelayMs = 0;
    clearRetryTimer(state);

    await setRelaySession({
      connected,
      projectId: onboarding.status === "completed" ? activeProject?.id ?? "" : "",
      assumedProjectId: activeProject?.id ?? "",
      assumedProjectName: activeProject?.name ?? "",
      stateStatus: nextStateStatus,
      trust,
      projectOptions: projects,
      onboarding,
    });
    await scheduleAutoCapture(tabId, { immediate: true });
  } catch (cause) {
    console.warn("[Relay BG] syncTabRemoteState failed", {
      reason: options.reason ?? "unknown",
      message: cause instanceof Error ? cause.message : "Failed to fetch",
      requestKey,
      projectId: state.projectId,
      page: {
        supported: state.page.supported,
        pathname: state.page.pathname ?? null,
        title: state.page.title ?? null,
        turns: state.page.turns ?? 0,
        signature: state.page.captureSignature?.slice(0, 16) ?? null,
      },
    });
    state.lastError =
      cause instanceof Error ? cause.message : "Failed to fetch";
    state.remoteStatus =
      state.lastSuccessfulSyncAt
        ? "stale"
        : "unavailable";
    scheduleRetry(tabId);
  } finally {
    state.syncInFlight = false;
    state.syncRequestKey = null;
    await broadcastActiveProjectState(tabId);
    if (state.syncQueued) {
      state.syncQueued = false;
      void syncTabRemoteState(tabId, { force: true, reason: "queued_refresh" });
    }
  }
}

function updateTabPageState(tabId: number, page: RelayPageState) {
  const state = getOrCreateTabState(tabId);
  const routeChanged =
    state.page.url !== page.url || state.page.pathname !== page.pathname;
  const signatureChanged =
    state.page.captureSignature !== page.captureSignature &&
    state.associationToast.mode === "saving";
  const pendingInsertedBrief = state.pendingInsertedBrief;
  const insertSignatureChanged =
    state.page.captureSignature !== page.captureSignature &&
    Boolean(pendingInsertedBrief);

  state.page = page;
  state.lastObservedSignature = page.captureSignature ?? null;
  state.lastObservedTurns = page.turns ?? 0;

  if (signatureChanged) {
    clearPendingAssociation(state, { clearChatAssociation: true });
    clearAssociationToast(state);
  }

  if (routeChanged) {
    state.lastError = null;
    state.capturePending = false;
    state.chatAssociation = createEmptyChatAssociation();
    state.routingReview = null;
    state.lastRoutedSignature = null;
    state.associationSuppressed = false;
    state.insertState = createEmptyInsertState();
    clearCaptureTimer(state);
    clearPendingAssociation(state);
    clearAssociationToast(state);
    clearPendingInsertedBrief(state);
  } else if (insertSignatureChanged) {
    const insertStillMatches = matchesPendingInsertedBrief(
      pendingInsertedBrief,
      page,
    );
    if (!insertStillMatches) {
      clearPendingInsertedBrief(state);
    }
  }
}

async function captureTab(projectId: string, tabId: number) {
  const startedAt = Date.now();
  console.warn("[Relay BG] capture start", {
    tabId,
    projectId,
    timeoutMs: CAPTURE_TAB_MESSAGE_TIMEOUT_MS,
  });

  const result = await sendTabMessageWithTimeout<any>(
    tabId,
    {
      type: "RELAY_CAPTURE_VISIBLE",
      payload: { projectId, tabId },
    },
    CAPTURE_TAB_MESSAGE_TIMEOUT_MS,
    "RELAY_CAPTURE_VISIBLE",
  );

  console.warn("[Relay BG] capture content response", {
    tabId,
    projectId,
    ok: result?.ok ?? false,
    reason: result?.reason ?? null,
    turns: result?.capture?.turns?.length ?? 0,
    signature: result?.capture?.session.captureSignature ?? null,
    sourceConversationId: result?.capture?.session.sourceConversationId ?? null,
    durationMs: Date.now() - startedAt,
  });

  if (!result?.ok || !result.capture) {
    return result ?? { ok: false, reason: "Capture failed." };
  }

  const fetchStartedAt = Date.now();
  let response: Response;
  try {
    response = await relayFetch(
      "/api/captures",
      {
        method: "POST",
        body: JSON.stringify({
          projectId,
          ...result.capture,
        }),
      },
      { timeoutMs: CAPTURE_API_TIMEOUT_MS },
    );
  } catch (cause) {
    const isAbort = cause instanceof DOMException && cause.name === "AbortError";
    const reason = isAbort
      ? `Capture request timed out after ${CAPTURE_API_TIMEOUT_MS}ms.`
      : cause instanceof Error
        ? cause.message
        : "Capture request failed.";

    console.warn("[Relay BG] capture api failed", {
      tabId,
      projectId,
      reason,
      durationMs: Date.now() - fetchStartedAt,
    });

    return {
      ok: false,
      reason,
    };
  }

  console.warn("[Relay BG] capture api response", {
    tabId,
    projectId,
    ok: response.ok,
    status: response.status,
    durationMs: Date.now() - fetchStartedAt,
  });

  if (!response.ok) {
    const rateLimitError = await readRateLimitError(response);
    return {
      ok: false,
      reason: rateLimitError?.message ?? await readErrorResponse(response, "Capture request failed."),
    };
  }

  const payload = await response.json();

  return {
    ok: true,
    sessionId: payload.session?.id ?? null,
    turns: payload.turns?.length ?? result.capture.turns?.length ?? 0,
    digestQueued: Boolean(payload.digestQueued),
    digestStrategy: (payload.digestStrategy ?? "skip") as "ai" | "deferred" | "skip",
    digestOutcome: payload.digestOutcome ?? null,
    budgetStatus: payload.budgetStatus ?? null,
    stateStatus: payload.stateStatus ?? null,
    reconciliation: payload.reconciliation ?? null,
  };
}

async function showAssociationToast(
  tabId: number,
  payload: RelayAssociationToastPayload,
) {
  const state = getOrCreateTabState(tabId);
  setAssociationToastState(state, payload);
  // Only auto-dismiss "done" toasts; "saving" and "ask" stay until resolved
  if (payload.mode === "done" && payload.expiresAt > 0) {
    scheduleAssociationToastExpiry(tabId, payload);
  }
  await broadcastActiveProjectState(tabId);

  const message: RelayMessage = {
    type: "RELAY_SHOW_ASSOCIATION_TOAST",
    payload,
  };

  void chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

async function archiveChatAssociation(
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
  await syncTabRemoteState(tabId, {
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

async function dismissCaptureReview(tabId: number) {
  const state = getOrCreateTabState(tabId);
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
  await broadcastActiveProjectState(tabId);
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

function shouldRequestAssociationAdjudication(decision: RelayRoutingDecision) {
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

function logRoutingDecision(
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
    projectOptions: state.projectOptions.length,
    sessionProjectOptions: sessionProjectOptionsCount,
    remoteStatus: state.remoteStatus,
  });
}

async function adjudicateAssociationRouting(
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

async function resolveAutoCaptureRouting(
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

async function showSavingToast(
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

async function showAskToast(
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

async function resolveAssociationToast(
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
    return captureObservedChange(tabId, payload.projectId, {
      manualSelection: true,
      skipAssociationToast: true,
    });
  }

  return { ok: true, action: "noop" as const };
}

async function archiveSessionQuietly(projectId: string, sessionId: string) {
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

async function retargetAssociation(
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
    await broadcastActiveProjectState(tabId);

    const result = await captureObservedChange(tabId, project.projectId, {
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
      await broadcastActiveProjectState(tabId);
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
  await broadcastActiveProjectState(tabId);
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

async function captureObservedChange(
  tabId: number,
  explicitProjectId?: string,
  options: {
    manualSelection?: boolean;
    skipAssociationToast?: boolean;
    autoCapture?: boolean;
  } = {},
) {
  const state = getOrCreateTabState(tabId);
  // Race guard: claim the tab synchronously before any await so a second
  // captureObservedChange arriving mid-flight (e.g. from the DOM observer
  // firing while a manual selection is still running) short-circuits
  // instead of mutating shared tab state concurrently.
  if (state.capturePending) {
    return { ok: false, reason: "Capture already in progress for this tab." };
  }
  state.capturePending = true;
  const flowId = createFlowId("ext-capture");
  let session = await getRelaySession();
  hydrateTabStateFromSession(state, session);
  const chatKey = buildAssociationKey(state.page);
  const manualSelection = Boolean(options.manualSelection);
  const skipAssociationToast = Boolean(options.skipAssociationToast);
  const autoCapture = Boolean(options.autoCapture);
  const previousAssociationProjectName = state.chatAssociation.projectName;
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "capture",
    event: "capture_started",
    flowId,
    message: "Started extension capture orchestration.",
    projectId: explicitProjectId ?? state.projectId ?? null,
    tabId,
    context: {
      trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
      chatProvider: state.page.platform ?? null,
      captureSignature: state.page.captureSignature ?? null,
      turnCount: state.page.turns ?? 0,
      sourceUrl: state.page.url ?? null,
    },
  });
  console.warn("[Relay BG] captureObservedChange start", {
    tabId,
    explicitProjectId: explicitProjectId ?? null,
    autoCapture,
    manualSelection,
    skipAssociationToast,
    turns: state.page.turns ?? 0,
    signature: state.page.captureSignature ?? null,
    stable: state.page.isStable,
    streaming: state.page.isStreaming,
    remoteStatus: state.remoteStatus,
  });
  await broadcastActiveProjectState(tabId);

  try {
    if (autoCapture) {
      await wait(AUTO_CAPTURE_GRACE_MS);
      await requestPageStateFromTab(tabId);

      const latestState = getOrCreateTabState(tabId);
      const stillEligible = shouldScheduleAutoCapture({
        page: latestState.page,
        capturePending: false,
        lastCapturedSignature: latestState.lastCapturedSignature,
        lastCapturedTurns: latestState.lastCapturedTurns,
      });

      console.warn("[Relay BG] auto-capture recheck", {
        tabId,
        eligible: stillEligible,
        turns: latestState.page.turns ?? 0,
        signature: latestState.page.captureSignature ?? null,
        stable: latestState.page.isStable,
        streaming: latestState.page.isStreaming,
      });

      if (!stillEligible) {
        recordBackgroundTelemetry({
          level: "info",
          surface: "extension-background",
          area: "capture",
          event: "capture_skipped",
          flowId,
          message: "Skipped extension capture while waiting for the chat to settle.",
          projectId: explicitProjectId ?? state.projectId ?? null,
          tabId,
          context: {
            trigger: "auto",
            reason: "waiting_for_settle",
            captureSignature: latestState.page.captureSignature ?? null,
            turnCount: latestState.page.turns ?? 0,
          },
        });
        return {
          ok: true,
          deferred: true,
          captured: false,
          reason: "Auto-capture is waiting for the chat to settle.",
        };
      }
    }

    if (!session.connected || !session.token || (!explicitProjectId && !session.autoCapture)) {
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "capture",
        event: "capture_skipped",
        flowId,
        message: "Skipped extension capture because session or auto-capture was not ready.",
        projectId: explicitProjectId ?? state.projectId ?? null,
        tabId,
        context: {
          trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
          reason: "capture_not_ready",
        },
      });
      return { ok: false, reason: "Auto-capture is not ready." };
    }

    if (!state.projectId && !explicitProjectId) {
      await syncTabRemoteState(tabId, {
        force: true,
        reason: "capture_needs_project",
      });
    }

    let projectId = explicitProjectId ?? state.projectId;
    let routingDecision: Awaited<ReturnType<typeof resolveAutoCaptureRouting>> | null =
      null;
    let autoAssociated = false;
    let savingToastShownAt: number | null = null;
    const ignoredFromMemory = explicitProjectId
      ? false
      : await isIgnoredChatKey(chatKey);
    const approvedAssociations = explicitProjectId
      ? []
      : await readApprovedAssociations();
    const exactApprovedAssociation = explicitProjectId
      ? null
      : findApprovedAssociationMatch(state.page, approvedAssociations);

    if (!explicitProjectId) {
      if (
        state.chatAssociation.status === "saved" &&
        state.chatAssociation.projectId
      ) {
        projectId = state.chatAssociation.projectId;
        state.associationSuppressed = false;
        state.routingReview = {
          confidence: "high",
          score: 100,
          reasons: ["This chat is already associated with the project."],
        };
        clearPendingAssociation(state);
        clearAssociationToast(state);
        state.lastRoutedSignature = state.page.captureSignature ?? chatKey;

        const signatureChanged =
          state.page.captureSignature &&
          state.page.captureSignature !== state.lastCapturedSignature;

        if (!signatureChanged) {
          return {
            ok: true,
            restored: true,
            captured: false,
            projectId,
            sessionId: state.chatAssociation.sessionId ?? null,
            reason: "This chat is already associated with the project.",
          };
        }

        // Signature changed — fall through to re-capture with the saved project
        autoAssociated = true;
      } else if (state.chatAssociation.status === "archived") {
        clearPendingAssociation(state, { clearChatAssociation: false });
        clearAssociationToast(state);
        state.associationSuppressed = true;
        state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
        state.routingReview = {
          confidence: "low",
          score: 0,
          reasons: ["This chat was detached from the project and will stay out of auto-capture."],
        };
        return {
          ok: true,
          ignored: true,
          captured: false,
          reason: "This chat was detached from the project.",
        };
      } else if (state.chatAssociation.status === "ignored") {
        clearPendingAssociation(state, { clearChatAssociation: false });
        clearAssociationToast(state);
        state.associationSuppressed = true;
        state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
        state.routingReview = {
          confidence: "low",
          score: 0,
          reasons: ["This chat was already dismissed from automatic capture."],
        };
        return {
          ok: true,
          ignored: true,
          captured: false,
          reason: "This chat was already dismissed from automatic capture.",
        };
      } else if (ignoredFromMemory) {
        clearPendingAssociation(state, { clearChatAssociation: true });
        clearAssociationToast(state);
        state.associationSuppressed = true;
        state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
        state.chatAssociation = {
          status: "ignored",
          projectId: null,
          projectName: null,
          sessionId: null,
          reason: "Relay will ignore this chat until you manually associate it.",
          capturedAt: null,
        };
        state.routingReview = {
          confidence: "low",
          score: 0,
          reasons: ["This chat was already dismissed from automatic capture."],
        };
        return {
          ok: true,
          ignored: true,
          captured: false,
          reason: "This chat was already dismissed from automatic capture.",
        };
      } else if (exactApprovedAssociation?.projectId) {
        restoreApprovedAssociationState(state, exactApprovedAssociation);
        projectId = exactApprovedAssociation.projectId;
        await clearIgnoredChatKey(chatKey);
        await setEffectiveProjectTarget(
          state,
          exactApprovedAssociation.projectId,
          exactApprovedAssociation.projectName,
        );
        return {
          ok: true,
          restored: true,
          captured: false,
          projectId,
          sessionId: exactApprovedAssociation.sessionId ?? null,
          reason: state.routingReview?.reasons[0] ?? "Matched a previously approved chat.",
        };
      } else {
        if (!state.projectOptions.length && !session.projectOptions.length) {
          await syncTabRemoteState(tabId, {
            force: true,
            reason: "association_needs_projects",
          });
          session = await getRelaySession();
          hydrateTabStateFromSession(state, session);
        }

        if (!state.projectOptions.length && !session.projectOptions.length) {
          state.routingReview = null;
          recordBackgroundTelemetry({
            level: "info",
            surface: "extension-background",
            area: "capture",
            event: "capture_skipped",
            flowId,
            message: "Skipped extension capture because no projects were available yet.",
            tabId,
            context: {
              trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
              reason: "waiting_for_project_routing",
            },
          });
          return {
            ok: true,
            deferred: true,
            captured: false,
            reason: "Waiting for project routing context.",
          };
        }

        routingDecision = await resolveAutoCaptureRouting(
          tabId,
          state,
          approvedAssociations,
        );

        state.routingReview = {
          confidence: routingDecision.confidence,
          score: routingDecision.score,
          reasons: [...routingDecision.reasons],
        };

        if (routingDecision.mode === "ignore") {
          const ignoredReason = routingDecision.reasons[0]
            ? `${routingDecision.reasons[0]} Manually associate this chat if Relay should keep it.`
            : "Relay will ignore this chat until you manually associate it.";
          clearPendingAssociation(state, { clearChatAssociation: true });
          clearAssociationToast(state);
          state.associationSuppressed = false;
          state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
          state.chatAssociation = {
            status: "ignored",
            projectId: null,
            projectName: null,
            sessionId: null,
            reason: ignoredReason,
            capturedAt: null,
          };
          logRoutingDecision("ignored", state, routingDecision);
          recordBackgroundTelemetry({
            level: "info",
            surface: "extension-background",
            area: "capture",
            event: "capture_skipped",
            flowId,
            message: ignoredReason,
            tabId,
            context: {
              trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
              reason: "routing_ignored",
            },
          });
          return {
            ok: true,
            ignored: true,
            captured: false,
            reason: ignoredReason,
          };
        }

        if (
          routingDecision.mode === "hold" &&
          routingDecision.candidateProjectId &&
          routingDecision.candidateProjectName
        ) {
          await clearIgnoredChatKey(chatKey);
          await setEffectiveProjectTarget(
            state,
            routingDecision.candidateProjectId,
            routingDecision.candidateProjectName,
            { persist: false },
          );
          await showAskToast(
            tabId,
            routingDecision.candidateProjectId,
            routingDecision.candidateProjectName,
          );
          recordBackgroundTelemetry({
            level: "info",
            surface: "extension-background",
            area: "capture",
            event: "capture_skipped",
            flowId,
            message: "Held extension capture pending association review.",
            projectId: routingDecision.candidateProjectId,
            tabId,
            context: {
              trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
              reason: "association_review_required",
            },
          });
          return {
            ok: true,
            held: true,
            captured: false,
            projectId: routingDecision.candidateProjectId,
            reason:
              routingDecision.reasons[0] ??
              "Waiting for review before saving this chat.",
          };
        }

        projectId = routingDecision.candidateProjectId ?? projectId;
        autoAssociated = Boolean(projectId);
      }
    }

    if (!projectId) {
      recordBackgroundTelemetry({
        level: "info",
        surface: "extension-background",
        area: "capture",
        event: "capture_skipped",
        flowId,
        message: "Skipped extension capture because no project was selected.",
        tabId,
        context: {
          trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
          reason: "missing_project",
        },
      });
      return { ok: false, reason: "Choose a project first." };
    }

    if (!skipAssociationToast && (autoAssociated || Boolean(explicitProjectId))) {
      const projectName = resolveAssociationProjectName({
        matchedProjectName:
          state.projectOptions.find((project) => project.id === projectId)?.name ??
          session.projectOptions.find((project) => project.id === projectId)?.name ??
          null,
        previousAssociationProjectName,
        routingCandidateProjectName: routingDecision?.candidateProjectName ?? null,
        stateProjectName: state.projectName,
        sessionAssumedProjectName: session.assumedProjectName || null,
      });

      if (autoAssociated && !explicitProjectId) {
        await clearIgnoredChatKey(chatKey);
        await setEffectiveProjectTarget(state, projectId, projectName, {
          persist: false,
        });
      }
      // Show the saving toast before capture so users can register what happened.
      await showSavingToast(tabId, projectId, projectName);
      savingToastShownAt = Date.now();
    }

    const result = await captureTab(projectId, tabId);
    if (result?.ok) {
      if (savingToastShownAt !== null) {
        const remainingDelay = getSavingToastMinimumDelayMs({
          shownAt: savingToastShownAt,
        });
        if (remainingDelay > 0) {
          await wait(remainingDelay);
        }
      }

      // Removed clearPendingAssociation(state) and clearAssociationToast(state) to prevent flashing the toast between states
      const matchedProject =
        state.projectOptions.find((project) => project.id === projectId) ??
        session.projectOptions.find((project) => project.id === projectId) ??
        null;
      const projectName = resolveAssociationProjectName({
        matchedProjectName: matchedProject?.name ?? null,
        previousAssociationProjectName,
        routingCandidateProjectName: routingDecision?.candidateProjectName ?? null,
        stateProjectName: state.projectName,
        sessionAssumedProjectName: session.assumedProjectName || null,
      });
      const associationProjectName = projectName;

      state.lastCapturedSignature =
        state.page.captureSignature ?? state.lastObservedSignature;
      state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
      state.lastCapturedTurns = state.page.turns ?? state.lastObservedTurns;

      // Persist to chrome.storage.session so dedup survives worker suspension
      void persistTabSignature(tabId, {
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
      await clearIgnoredChatKey(chatKey);
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
      if (result.sessionId) {
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
          sessionId: result.sessionId,
          approvedAt: new Date().toISOString(),
        });
      }
      await syncTabRemoteState(tabId, {
        force: true,
        reason: "capture_complete",
      });

      // Schedule drain for deferred captures
      if (result.digestStrategy === "deferred" && projectId) {
        scheduleDrain(projectId);
      }

      if (
        projectId &&
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

      // Show the success toast after the saving state has had time to register.
      const digestStatus =
        result.digestStrategy === "ai" && result.digestOutcome?.status === "completed"
          ? "analyzed" as const
        : result.digestStrategy === "deferred" ? "queued" as const
        : null;
      const { toast: doneToast } = buildDoneToast({
        projectId,
        projectName: state.projectName ?? projectName ?? "",
        digestStatus,
      });
      await showAssociationToast(tabId, doneToast);

      // Force other tabs to re-sync on next focus so they see fresh project state
      for (const [otherTabId, otherState] of tabStates.entries()) {
        if (otherTabId !== tabId) {
          otherState.lastSuccessfulSyncAt = null;
        }
      }

      // Store budget status for sidepanel display
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
        turns: result.turns ?? state.page.turns ?? 0,
        digestQueued: Boolean(result.digestQueued),
        captured: true,
        autoAssociated,
        sessionId: result.sessionId ?? null,
        stateStatus: result.stateStatus ?? session.stateStatus,
      };
    }

    clearPendingAssociation(state, { clearChatAssociation: true });
    clearAssociationToast(state);
    state.lastError = result?.reason ?? "Capture failed.";
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "capture",
      event: "capture_failed",
      flowId,
      message: result?.reason ?? "Capture failed.",
      projectId: explicitProjectId ?? state.projectId ?? null,
      tabId,
      context: {
        trigger: autoCapture ? "auto" : manualSelection ? "manual" : "association",
        captureSignature: state.page.captureSignature ?? null,
        turnCount: state.page.turns ?? 0,
      },
    });
    return result ?? { ok: false, reason: "Capture failed." };
  } finally {
    state.capturePending = false;
    clearCaptureTimer(state);
    await broadcastActiveProjectState(tabId);
  }
}

async function scheduleAutoCapture(
  tabId: number,
  options: { immediate?: boolean } = {},
) {
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
    void broadcastActiveProjectState(tabId);
    state.captureTimer = setTimeout(() => {
      state.captureTimer = null;
      const latestState = getOrCreateTabState(tabId);
      const latestPendingInsertedBrief = latestState.pendingInsertedBrief;
      if (
        !latestPendingInsertedBrief ||
        latestState.chatAssociation.status !== "none" ||
        !matchesPendingInsertedBrief(latestPendingInsertedBrief, latestState.page)
      ) {
        return;
      }

      void captureObservedChange(tabId, latestPendingInsertedBrief.projectId, {
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
    void broadcastActiveProjectState(tabId);
    state.captureTimer = setTimeout(() => {
      state.captureTimer = null;
      void captureObservedChange(tabId, state.chatAssociation.projectId ?? undefined, {
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

  void captureObservedChange(tabId, undefined, { autoCapture: true });
}

async function insertProjectBrief(
  tabId: number,
  explicitProjectId?: string,
  source: RelayInsertState["source"] = "sidebar",
) {
  const state = getOrCreateTabState(tabId);
  const pageState = state.page.supported
    ? state.page
    : await requestPageStateFromTab(tabId);

  if (!pageState.supported) {
    return {
      ok: false,
      reason: "Insert project brief works only on a supported AI tab.",
    };
  }

  if (!state.projectId && !explicitProjectId) {
    await syncTabRemoteState(tabId, {
      force: true,
      reason: "insert_needs_project",
    });
  }

  const session = await getRelaySession();
  const projectId =
    explicitProjectId ?? getOrCreateTabState(tabId).projectId ?? "";
  if (!projectId) {
    return { ok: false, reason: "Choose a project first." };
  }
  const flowId = createFlowId("ext-insert");

  clearInsertStateTimer(state);
  setInsertState(state, {
    status: "inserting",
    source,
    message: "Inserting project brief…",
  });
  await broadcastActiveProjectState(tabId);
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "brief",
    event: "brief_insert_started",
    flowId,
    message: "Started project brief insertion.",
    projectId,
    tabId,
    context: {
      source,
      targetSurface: source,
      chatProvider: pageState.platform ?? null,
      sourceUrl: pageState.url ?? null,
    },
  });

  const targetProfileKey = resolveTargetProfile({
    platform: pageState.platform,
    targetMode: session.targetMode,
    manualTargetProfileKey: session.targetProfileKey,
  });
  const kind =
    pageState.isFreshChat ||
    (looksLikeFreshChatRoute(pageState) && (pageState.turns ?? 0) === 0)
      ? "fresh_chat_bootstrap"
      : "quick_continuity";

  const response = await relayFetch(`/api/projects/${projectId}/bootstrap`, {
    method: "POST",
    body: JSON.stringify({
      targetProfileKey,
      kind,
      deep: kind === "fresh_chat_bootstrap",
      syncSurface: pageState.platform ?? undefined,
    }),
  });

  if (!response.ok) {
    const reason = await readErrorResponse(
      response,
      "Project brief generation failed.",
    );
    state.lastError = reason;
    state.remoteStatus = state.lastSuccessfulSyncAt ? "stale" : "unavailable";
    setInsertState(state, {
      status: "error",
      source,
      message: reason,
    });
    await broadcastActiveProjectState(tabId);
    scheduleInsertStateReset(tabId);
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "brief",
      event: "brief_insert_failed",
      flowId,
      message: reason,
      projectId,
      tabId,
      context: {
        source,
        targetSurface: source,
        failureStage: "bootstrap_request",
      },
    });
    return { ok: false, reason };
  }

  const generated = (await response.json()) as {
    status?: "ready" | "pending";
    packet?: {
      content?: string;
      generationMetadata?: Record<string, unknown>;
    };
    reason?: string | null;
    stateStatus?: ProjectStateStatusDto | null;
  };

  if (generated.stateStatus) {
    state.stateStatus = generated.stateStatus;
    await setRelaySession({ stateStatus: generated.stateStatus });
  }

  if (generated.status === "pending" || !generated.packet?.content) {
    setInsertState(state, {
      status: "error",
      source,
      message: generated.reason ?? "Relay is still preparing your project brief.",
    });
    await broadcastActiveProjectState(tabId);
    scheduleInsertStateReset(tabId);
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "brief",
      event: "brief_insert_failed",
      flowId,
      message:
        generated.reason ?? "Relay is still preparing your project brief.",
      projectId,
      tabId,
      context: {
        source,
        targetSurface: source,
        failureStage: "bootstrap_pending",
      },
    });
    return {
      ok: false,
      reason:
        generated.reason ?? "Relay is still preparing your project brief.",
    };
  }

  const inserted = await chrome.tabs.sendMessage(tabId, {
    type: "RELAY_INSERT_CONTEXT",
    payload: { content: generated.packet.content },
  });

  if (!inserted?.ok) {
    setInsertState(state, {
      status: "error",
      source,
      message: inserted?.reason ?? "Insert failed.",
    });
    await broadcastActiveProjectState(tabId);
    scheduleInsertStateReset(tabId);
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "brief",
      event: "brief_insert_failed",
      flowId,
      message: inserted?.reason ?? "Insert failed.",
      projectId,
      tabId,
      context: {
        source,
        targetSurface: source,
        failureStage: "content_insert",
      },
    });
    return { ok: false, reason: inserted?.reason ?? "Insert failed." };
  }

  state.pendingInsertedBrief = buildPendingInsertedBriefState({
    projectId,
    projectName: state.projectName ?? "",
    page: pageState,
    content: generated.packet.content,
  });
  await rememberProjectSelection(
    projectId,
    tabId,
    pageState,
    state.projectName,
  );
  invalidateProjectCache(projectId);

  const actualModel = String(
    generated.packet.generationMetadata?.actual_model ?? "",
  );
  const limitedMode = actualModel === "deterministic";
  await setRelaySession({
    limitedMode,
    lastStatus: limitedMode
      ? "Inserted a limited project brief."
      : "Inserted the project brief.",
    assumedProjectId: projectId,
    assumedProjectName: state.projectName ?? "",
  });

  setInsertState(state, {
    status: "inserted",
    source,
    message: limitedMode
      ? "Inserted a limited project brief."
      : "Inserted the project brief.",
  });
  await broadcastActiveProjectState(tabId);
  scheduleInsertStateReset(tabId);

  await syncTabRemoteState(tabId, { force: true, reason: "insert_complete" });
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "brief",
    event: "brief_insert_completed",
    flowId,
    message: "Inserted the project brief into the chat input.",
    projectId,
    tabId,
    context: {
      source,
      targetSurface: source,
      limitedMode,
      kind,
      actualModel: actualModel || null,
    },
  });

  return {
    ok: true,
    limitedMode,
    stateStatus: generated.stateStatus ?? null,
  };
}

function registerRelayContextMenu() {
  if (!chrome.contextMenus) {
    console.warn("[relay] contextMenus API unavailable");
    return;
  }
  try {
    chrome.contextMenus.removeAll(() => {
      try {
        chrome.contextMenus.create(
          {
            id: "relay-save-selection",
            title: 'Save "%s" to Relay',
            contexts: ["selection"],
          },
          () => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[relay] contextMenus.create failed",
                chrome.runtime.lastError.message,
              );
            } else {
              console.info("[relay] contextMenus.create ok");
            }
          },
        );
      } catch (cause) {
        console.warn("[relay] contextMenus.create threw", cause);
      }
    });
  } catch (cause) {
    console.warn("[relay] contextMenus.removeAll threw", cause);
  }
}

chrome.runtime.onInstalled.addListener((details: { reason: string; previousVersion?: string }) => {
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "lifecycle",
    event: details.reason === "update" ? "extension_updated" : "extension_installed",
    message:
      details.reason === "update"
        ? "Relay extension updated."
        : "Relay extension installed.",
    context: {
      previousVersion: details.previousVersion ?? null,
      reason: details.reason,
    },
  });

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);

  registerRelayContextMenu();

  // Register MAIN world content script for network interception.
  // This must be done via scripting API because Plasmo doesn't support
  // world: "MAIN" in its manifest transformer.
  const networkInterceptScript = {
    id: "relay-network-intercept",
    matches: [
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://claude.ai/*",
      "https://perplexity.ai/*",
      "https://www.perplexity.ai/*",
      "https://codex.openai.com/*",
      "https://gemini.google.com/*",
      "https://aistudio.google.com/*",
      "https://grok.com/*",
      "https://chat.deepseek.com/*",
    ],
    js: ["static/network-intercept.js"],
    runAt: "document_start" as const,
    world: "MAIN" as const,
  };

  void chrome.scripting
    .registerContentScripts([networkInterceptScript])
    .catch(() => {
      // Already registered from a previous install — update instead
      void chrome.scripting
        .updateContentScripts([networkInterceptScript])
        .catch(() => undefined);
    });
});

chrome.runtime.onStartup.addListener(() => {
  registerRelayContextMenu();
});

// Also register at module load so that the service worker waking up
// for a non-onStartup reason (e.g. external message) still has the menu.
registerRelayContextMenu();

chrome.contextMenus.onClicked.addListener(
  (
    info: {
      menuItemId: string | number;
      selectionText?: string;
      pageUrl?: string;
    },
    tab: { id?: number; url?: string; title?: string } | undefined,
  ) => {
    console.info("[relay] contextMenus.onClicked", {
      menuItemId: info.menuItemId,
      hasSelection: Boolean(info.selectionText),
      tabId: tab?.id,
    });
    void (async () => {
      try {
        if (info.menuItemId !== "relay-save-selection") return;
        if (!info.selectionText || !tab?.id) {
          console.warn("[relay] contextMenus.onClicked: missing selection or tab", {
            hasSelection: Boolean(info.selectionText),
            tabId: tab?.id,
          });
          return;
        }
        const pageUrl = info.pageUrl ?? tab.url ?? null;
        await handleSaveSelectionToRelay({
          selectionText: info.selectionText,
          pageUrl,
          pageTitle: tab.title ?? null,
          platform: null,
          tabId: tab.id,
          trigger: "context_menu",
        });
      } catch (cause) {
        console.error("[relay] contextMenus.onClicked: unhandled", cause);
        await showFailureToastInTab(
          tab?.id ?? null,
          cause instanceof Error ? cause.message : "Relay save failed.",
        );
      }
    })();
  },
);

chrome.tabs.onUpdated.addListener(
  (tabId: number, changeInfo: { status?: string }) => {
    if (changeInfo.status === "complete") {
      void requestPageStateFromTab(tabId);
      void syncTabRemoteState(tabId, { force: true, reason: "tab_complete" });
    }
  },
);

chrome.runtime.onSuspend.addListener(() => {
  void flushBackgroundTelemetry();
});

chrome.tabs.onActivated.addListener((activeInfo: { tabId: number }) => {
  void requestPageStateFromTab(activeInfo.tabId);
  const state = tabStates.get(activeInfo.tabId);
  void syncTabRemoteState(activeInfo.tabId, {
    force: true,
    reason: "tab_focus",
  });

  if (
    state &&
    state.lastObservedSignature &&
    state.lastObservedSignature !== state.lastCapturedSignature
  ) {
    void scheduleAutoCapture(activeInfo.tabId, { immediate: true });
  }
});

chrome.tabs.onRemoved.addListener((tabId: number) => {
  clearTabState(tabId);
});

chrome.commands?.onCommand.addListener((command: string) => {
  if (command !== "insert-project-brief") return;

  void (async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) return;

    try {
      const response = (await chrome.tabs.sendMessage(tab.id, {
        type: "RELAY_SHORTCUT_ACTION",
      })) as {
        ok?: boolean;
        action?:
          | "restored"
          | "opened"
          | "invoked_insert"
          | "already_visible"
          | "no_op"
          | "fallback";
      };

      if (
        response?.ok &&
        response.action &&
        response.action !== "fallback" &&
        response.action !== "no_op"
      ) {
        return;
      }
    } catch {
      // Fall back to a direct insert when the page does not respond to shortcut orchestration.
    }

    await requestPageStateFromTab(tab.id);
    await insertProjectBrief(tab.id, undefined, "shortcut");
  })();
});

interface SaveSelectionParams {
  selectionText: string;
  pageUrl: string | null;
  pageTitle: string | null;
  platform: string | null;
  extraMetadata?: Record<string, unknown>;
  tabId: number | null;
  projectIdOverride?: string | null;
  trigger: "context_menu" | "pin_selection";
}

interface SaveSelectionResult {
  ok: boolean;
  reason?: string;
  projectId?: string;
}

// Injected into an arbitrary page via chrome.scripting.executeScript.
// Must be a standalone function — no closure over background-worker state.
function relaySaveToastInPage(message: string) {
  const HOST_ID = "relay-save-toast";
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "right:24px",
    "z-index:2147483647",
    "max-width:340px",
    "padding:12px 16px",
    "border-radius:10px",
    "background:#18181b",
    "color:#fafafa",
    "font:500 13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "box-shadow:0 10px 32px rgba(0,0,0,0.35),0 0 0 1px rgba(255,255,255,0.08)",
    "opacity:0",
    "transform:translateY(8px)",
    "transition:opacity 180ms ease,transform 180ms ease",
    "pointer-events:none",
  ].join(";");
  host.textContent = `Relay — ${message}`;
  document.documentElement.appendChild(host);

  requestAnimationFrame(() => {
    host.style.opacity = "1";
    host.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    host.style.opacity = "0";
    host.style.transform = "translateY(8px)";
    setTimeout(() => host.remove(), 220);
  }, 3800);
}

async function showFailureToastInTab(tabId: number | null, message: string) {
  if (tabId === null) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: relaySaveToastInPage,
      args: [message],
    });
  } catch {
    // Injection can fail on restricted pages (chrome://, extension pages,
    // the Web Store, etc). Fall back to a runtime message for supported AI
    // sites that already have the content script listening.
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "RELAY_SHOW_SIMPLE_TOAST",
        payload: { message },
      });
    } catch {
      // Nothing we can do — surface only via the service-worker console.
    }
  }
}

async function handleSaveSelectionToRelay(
  params: SaveSelectionParams,
): Promise<SaveSelectionResult> {
  const {
    selectionText,
    pageUrl,
    pageTitle,
    platform,
    extraMetadata,
    tabId,
    projectIdOverride,
    trigger,
  } = params;
  const flowId = createFlowId("ext-save");

  console.info("[relay] save_to_relay:start", {
    trigger,
    tabId,
    pageUrl,
    length: selectionText?.length ?? 0,
  });

  const trimmed = selectionText.trim();
  if (!trimmed) {
    await showFailureToastInTab(tabId, "Select text on the page first.");
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "memory",
      event: "selection_save_failed",
      flowId,
      message: "Selection save failed because no text was selected.",
      tabId,
      context: {
        trigger,
        failureStage: "selection_missing",
      },
    });
    return { ok: false, reason: "Select text in the page first." };
  }

  // Resolve projectId: override → tab state → last active session project.
  let projectId = projectIdOverride ?? null;
  if (!projectId && tabId !== null) {
    projectId = getOrCreateTabState(tabId).projectId ?? null;
  }
  if (!projectId) {
    const session = await getRelaySession();
    projectId = session.projectId || null;
  }

  if (!projectId) {
    if (tabId !== null) {
      try {
        void chrome.sidePanel.open({ tabId });
      } catch {
        // Opening the side panel can fail on unsupported contexts — ignore.
      }
    }
    await showFailureToastInTab(
      tabId,
      "Pick a project in the Relay sidepanel, then try again.",
    );
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "memory",
      event: "selection_save_failed",
      flowId,
      message: "Selection save failed because no project was selected.",
      tabId,
      context: {
        trigger,
        failureStage: "project_missing",
      },
    });
    return { ok: false, reason: "Choose a project first." };
  }

  let hostname: string | null = null;
  if (pageUrl) {
    try {
      hostname = new URL(pageUrl).hostname;
    } catch {
      hostname = null;
    }
  }

  const titleSource = pageTitle ?? hostname ?? platform ?? "web";
  const body = {
    type: "note" as const,
    pinned: true,
    title: `Saved from ${titleSource}`,
    content: trimmed,
    metadata: {
      ...(extraMetadata ?? {}),
      sourceUrl: pageUrl,
      sourceTitle: pageTitle,
      hostname,
      platform: platform ?? null,
      capturedVia: trigger,
    },
  };

  let response: Response;
  try {
    response = await relayFetch(`/api/projects/${projectId}/memory`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (cause) {
    const reason =
      cause instanceof Error ? cause.message : "Save to Relay failed.";
    console.error("[relay] save_to_relay:network_error", cause);
    await showFailureToastInTab(tabId, reason);
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "memory",
      event: "save_to_relay.failed",
      message: reason,
      projectId,
      context: {
        trigger,
        hostname,
        textLength: trimmed.length,
      },
      error: cause,
    });
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "memory",
      event: "selection_save_failed",
      flowId,
      message: reason,
      projectId,
      tabId,
      context: {
        trigger,
        hostname,
        failureStage: "network",
        textLength: trimmed.length,
      },
      error: cause,
    });
    return { ok: false, reason };
  }

  if (!response.ok) {
    const reason = await readErrorResponse(response, "Save to Relay failed.");
    console.error("[relay] save_to_relay:http_error", response.status, reason);
    await showFailureToastInTab(tabId, reason);
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "memory",
      event: "save_to_relay.failed",
      message: reason,
      projectId,
      context: {
        trigger,
        hostname,
        textLength: trimmed.length,
        status: response.status,
      },
    });
    recordBackgroundTelemetry({
      level: "error",
      surface: "extension-background",
      area: "memory",
      event: "selection_save_failed",
      flowId,
      message: reason,
      projectId,
      tabId,
      context: {
        trigger,
        hostname,
        failureStage: "http_response",
        textLength: trimmed.length,
        status: response.status,
      },
    });
    return { ok: false, reason };
  }

  invalidateProjectCache(projectId);

  // Only refresh tab state if this tab has an active Relay tab state
  // (i.e. a supported AI site). Arbitrary webpages don't get tabStates entries.
  if (tabId !== null && tabStates.has(tabId)) {
    const state = getOrCreateTabState(tabId);
    try {
      await rememberProjectSelection(
        projectId,
        tabId,
        state.page,
        state.projectName,
      );
    } catch {
      // Binding refresh is best-effort.
    }
    void syncTabRemoteState(tabId, {
      force: true,
      reason: "save_to_project",
    });
  }

  console.info("[relay] save_to_relay:ok", { projectId, trigger });

  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "memory",
    event: "save_to_relay.succeeded",
    message: `Saved selection to project ${projectId} via ${trigger}.`,
    projectId,
    context: {
      trigger,
      hostname,
      textLength: trimmed.length,
    },
  });
  recordBackgroundTelemetry({
    level: "info",
    surface: "extension-background",
    area: "memory",
    event: "selection_save_completed",
    flowId,
    message: `Saved selection to project ${projectId}.`,
    projectId,
    tabId,
    context: {
      trigger,
      hostname,
      textLength: trimmed.length,
      sourceUrl: pageUrl,
      chatProvider: platform,
    },
  });

  try {
    void chrome.runtime
      .sendMessage({
        type: "RELAY_PROJECT_MEMORY_UPDATED",
        payload: { projectId },
      } satisfies RelayMessage)
      .catch(() => undefined);
  } catch {
    // sidepanel may not be open; ignore
  }

  return { ok: true, projectId };
}

chrome.runtime.onMessage.addListener(
  (
    message: RelayMessage,
    sender: { tab?: { id?: number } },
    sendResponse: (response?: unknown) => void,
  ) => {
    void (async () => {
      try {
        if (message.type === "RELAY_OPEN_SIDE_PANEL") {
          const tabId = sender.tab?.id;
          if (tabId) {
            await chrome.sidePanel.open({ tabId });
          }
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "RELAY_OPEN_DASHBOARD") {
          try {
            const session = await getRelaySession();
            const apiBase = resolveRelayApiBase({
              storedApiBase: session.apiBase,
            });
            const nextUrl = new URL(message.payload?.nextPath ?? "/dashboard", apiBase);
            nextUrl.searchParams.set("extensionId", chrome.runtime.id);
            await chrome.tabs.create({ url: nextUrl.toString() });
            sendResponse({ ok: true });
          } catch (cause) {
            sendResponse({
              ok: false,
              reason:
                cause instanceof Error
                  ? cause.message
                  : "Failed to open the Relay dashboard.",
            });
          }
          return;
        }

        if (message.type === "RELAY_GOOGLE_SIGN_IN") {
          console.log("[Relay BG] RELAY_GOOGLE_SIGN_IN received");
          try {
            const flowId = message.payload.flowId ?? createFlowId("ext-auth");
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "auth",
              event: "google_sign_in.started",
              flowId,
              message: "Received Google sign-in request from the extension UI.",
              context: {
                deviceName: message.payload.deviceName,
              },
            });
            const googleTokens = await requestGoogleIdentityTokens({
              interactive: true,
              prompt: "select_account",
            });

            const session = await getRelaySession();
            const apiBase = resolveRelayApiBase({
              storedApiBase: session.apiBase,
            });
            const response = await fetch(
              `${apiBase}/api/extension/auth/google`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-relay-flow-id": flowId,
                },
                body: JSON.stringify({
                  googleAccessToken: googleTokens.accessToken,
                  googleIdToken: googleTokens.idToken,
                  deviceName: message.payload.deviceName,
                }),
              },
            );
            console.log("[Relay BG] extension auth response status:", response.status);
            recordBackgroundTelemetry({
              level: response.ok ? "info" : "warn",
              surface: "extension-background",
              area: "auth",
              event: "google_sign_in.api_response",
              flowId,
              message: `Extension Google auth returned ${response.status}.`,
              context: {
                status: response.status,
              },
            });

            if (!response.ok) {
              const reason = await readErrorResponse(
                response,
                "Google sign-in failed.",
              );
              console.log("[Relay BG] extension auth failed:", reason);
              recordBackgroundTelemetry({
                level: "error",
                surface: "extension-background",
                area: "auth",
                event: "google_sign_in.failed",
                flowId,
                message: reason,
              });
              recordBackgroundTelemetry({
                level: "error",
                surface: "extension-background",
                area: "auth",
                event: "extension_auth_failed",
                flowId,
                message: reason,
                context: {
                  authMethod: "google",
                },
              });
              sendResponse({ ok: false, reason });
              return;
            }

            const payload = (await response.json()) as {
              token: string;
              apiBase: string;
              userId?: string;
              projectId: string;
              projects?: RelayProjectOption[];
              onboarding?: RelayOnboardingState;
              settings?: { settings?: { autoCapture?: boolean } };
            };
            console.log("[Relay BG] extension auth payload:", {
              apiBase: payload.apiBase,
              hasToken: Boolean(payload.token),
              projectId: payload.projectId,
            });
            if (!payload.token || !payload.apiBase) {
              recordBackgroundTelemetry({
                level: "error",
                surface: "extension-background",
                area: "auth",
                event: "google_sign_in.invalid_payload",
                flowId,
                message: "Extension auth completed but Relay returned an incomplete session payload.",
              });
              sendResponse({
                ok: false,
                reason: "Extension auth completed but Relay did not return a valid session.",
              });
              return;
            }

            await storeAuthenticatedExtensionSession(
              payload,
              "Signed in with Google.",
            );
            authGraceUntil = Date.now() + 5_000;
            await loadSessionData();
            const storedSession = await getRelaySession();
            await identifyExtensionUser(storedSession.userId);
            console.log("[Relay BG] stored session after Google auth:", {
              connected: storedSession.connected,
              apiBase: storedSession.apiBase,
              hasToken: Boolean(storedSession.token),
              projectId: storedSession.projectId,
            });
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "auth",
              event: "google_sign_in.succeeded",
              flowId,
              message: "Stored Relay session after Google sign-in.",
              context: {
                connected: storedSession.connected,
                projectId: storedSession.projectId,
                hasToken: Boolean(storedSession.token),
              },
            });
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "auth",
              event: "extension_auth_completed",
              flowId,
              message: "Extension Google sign-in completed.",
              userId: storedSession.userId || null,
              projectId: storedSession.projectId || null,
              context: {
                authMethod: "google",
                connected: storedSession.connected,
              },
            });

            sendResponse({ ok: true });
          } catch (cause) {
            console.error("[Relay BG] Google sign-in exception:", cause);
            recordBackgroundTelemetry({
              level: "error",
              surface: "extension-background",
              area: "auth",
              event: "google_sign_in.exception",
              message: "Google sign-in threw an exception in the background worker.",
              error: cause,
            });
            recordBackgroundTelemetry({
              level: "error",
              surface: "extension-background",
              area: "auth",
              event: "extension_auth_failed",
              message: "Extension Google sign-in failed.",
              context: {
                authMethod: "google",
              },
              error: cause,
            });
            sendResponse({
              ok: false,
              reason:
                cause instanceof Error
                  ? cause.message
                  : "Google sign-in failed.",
            });
          }
          return;
        }

        if (message.type === "RELAY_LOCAL_SIGN_IN") {
          try {
            const flowId = message.payload.flowId ?? createFlowId("ext-local-auth");
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "auth",
              event: "local_sign_in.started",
              flowId,
              message: "Received local sign-in request from the extension UI.",
              context: {
                deviceName: message.payload.deviceName,
                email: message.payload.email,
              },
            });

            const session = await getRelaySession();
            const apiBase = resolveRelayApiBase({
              storedApiBase: session.apiBase,
            });
            const response = await fetch(
              `${apiBase}/api/extension/auth/local`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-relay-flow-id": flowId,
                },
                body: JSON.stringify({
                  email: message.payload.email,
                  name: message.payload.name ?? null,
                  deviceName: message.payload.deviceName,
                }),
              },
            );

            recordBackgroundTelemetry({
              level: response.ok ? "info" : "warn",
              surface: "extension-background",
              area: "auth",
              event: "local_sign_in.api_response",
              flowId,
              message: `Extension local auth returned ${response.status}.`,
              context: {
                status: response.status,
                apiBase,
              },
            });
            console.warn("[Relay BG] local sign-in api response", {
              status: response.status,
              apiBase,
              flowId,
            });

            if (!response.ok) {
              const reason = await readErrorResponse(
                response,
                "Local sign-in failed.",
              );
              console.warn("[Relay BG] local sign-in failed", {
                status: response.status,
                apiBase,
                reason,
                flowId,
              });
              recordBackgroundTelemetry({
                level: "error",
                surface: "extension-background",
                area: "auth",
                event: "local_sign_in.failed",
                flowId,
                message: reason,
                context: {
                  apiBase,
                  status: response.status,
                },
              });
              recordBackgroundTelemetry({
                level: "error",
                surface: "extension-background",
                area: "auth",
                event: "extension_auth_failed",
                flowId,
                message: reason,
                context: {
                  authMethod: "local",
                },
              });
              sendResponse({ ok: false, reason });
              return;
            }

            const payload = (await response.json()) as ExtensionAuthSessionPayload;
            if (!payload.token || !payload.apiBase) {
              sendResponse({
                ok: false,
                reason: "Local sign-in completed but Relay did not return a valid session.",
              });
              return;
            }

            await storeAuthenticatedExtensionSession(
              payload,
              "Signed in locally.",
            );
            authGraceUntil = Date.now() + 5_000;
            await loadSessionData();
            const storedSession = await getRelaySession();
            await identifyExtensionUser(storedSession.userId);
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "auth",
              event: "extension_auth_completed",
              flowId,
              message: "Extension local sign-in completed.",
              userId: storedSession.userId || null,
              projectId: storedSession.projectId || null,
              context: {
                authMethod: "local",
                connected: storedSession.connected,
              },
            });
            sendResponse({ ok: true });
          } catch (cause) {
            recordBackgroundTelemetry({
              level: "error",
              surface: "extension-background",
              area: "auth",
              event: "local_sign_in.exception",
              message: "Local sign-in threw an exception in the background worker.",
              error: cause,
            });
            recordBackgroundTelemetry({
              level: "error",
              surface: "extension-background",
              area: "auth",
              event: "extension_auth_failed",
              message: "Extension local sign-in failed.",
              context: {
                authMethod: "local",
              },
              error: cause,
            });
            sendResponse({
              ok: false,
              reason:
                cause instanceof Error
                  ? cause.message
                  : "Local sign-in failed.",
            });
          }
          return;
        }

        if (message.type === "RELAY_EMAIL_SIGN_IN") {
          try {
            const flowId = message.payload.flowId ?? createFlowId("ext-email-auth");
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "auth",
              event: "email_sign_in.started",
              flowId,
              message: "Received email sign-in request from the extension UI.",
              context: {
                deviceName: message.payload.deviceName,
                intent: message.payload.intent ?? "sign-in",
              },
            });

            const session = await getRelaySession();
            const apiBase = resolveRelayApiBase({
              storedApiBase: session.apiBase,
            });
            const response = await fetch(
              `${apiBase}/api/extension/auth/email`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-relay-flow-id": flowId,
                },
                body: JSON.stringify({
                  email: message.payload.email,
                  password: message.payload.password,
                  name: message.payload.name ?? null,
                  intent: message.payload.intent ?? "sign-in",
                  otp: message.payload.otp ?? null,
                  resendOnly: message.payload.resendOnly ?? false,
                  deviceName: message.payload.deviceName,
                }),
              },
            );

            recordBackgroundTelemetry({
              level: response.ok ? "info" : "warn",
              surface: "extension-background",
              area: "auth",
              event: "email_sign_in.api_response",
              flowId,
              message: `Extension email auth returned ${response.status}.`,
              context: {
                status: response.status,
                apiBase,
              },
            });

            if (response.status === 202) {
              const payload = (await response.json().catch(() => ({}))) as {
                requiresOtp?: boolean;
                message?: string;
              };
              sendResponse({
                ok: true,
                requiresOtp: payload.requiresOtp ?? true,
                message: payload.message ?? "Enter the verification code sent to your email.",
              });
              return;
            }

            if (!response.ok) {
              const reason = await readErrorResponse(
                response,
                "Email sign-in failed.",
              );
              recordBackgroundTelemetry({
                level: "error",
                surface: "extension-background",
                area: "auth",
                event: "email_sign_in.failed",
                flowId,
                message: reason,
                context: {
                  apiBase,
                  status: response.status,
                },
              });
              recordBackgroundTelemetry({
                level: "error",
                surface: "extension-background",
                area: "auth",
                event: "extension_auth_failed",
                flowId,
                message: reason,
                context: {
                  authMethod: "email",
                },
              });
              sendResponse({ ok: false, reason });
              return;
            }

            const payload = (await response.json()) as ExtensionAuthSessionPayload;
            if (!payload.token || !payload.apiBase) {
              sendResponse({
                ok: false,
                reason: "Email sign-in completed but Relay did not return a valid session.",
              });
              return;
            }

            await storeAuthenticatedExtensionSession(
              payload,
              "Signed in with email.",
            );
            authGraceUntil = Date.now() + 5_000;
            await loadSessionData();
            const storedSession = await getRelaySession();
            await identifyExtensionUser(storedSession.userId);
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "auth",
              event: "extension_auth_completed",
              flowId,
              message: "Extension email sign-in completed.",
              userId: storedSession.userId || null,
              projectId: storedSession.projectId || null,
              context: {
                authMethod: "email",
                connected: storedSession.connected,
              },
            });
            sendResponse({ ok: true });
          } catch (cause) {
            recordBackgroundTelemetry({
              level: "error",
              surface: "extension-background",
              area: "auth",
              event: "email_sign_in.exception",
              message: "Email sign-in threw an exception in the background worker.",
              error: cause,
            });
            recordBackgroundTelemetry({
              level: "error",
              surface: "extension-background",
              area: "auth",
              event: "extension_auth_failed",
              message: "Extension email sign-in failed.",
              context: {
                authMethod: "email",
              },
              error: cause,
            });
            sendResponse({
              ok: false,
              reason:
                cause instanceof Error
                  ? cause.message
                  : "Email sign-in failed.",
            });
          }
          return;
        }

        if (message.type === "RELAY_SCAN_PROJECT_URL") {
          try {
            const flowId = message.payload.flowId ?? createFlowId("ext-project-scan");
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "projects",
              event: "project_scan_url.started",
              flowId,
              message: "Received project URL scan request from the extension UI.",
            });

            const response = await relayFetch("/api/projects/scan-url", {
              method: "POST",
              headers: {
                "x-relay-flow-id": flowId,
              },
              body: JSON.stringify({
                url: message.payload.url,
              }),
            });

            if (!response.ok) {
              const reason = await readErrorResponse(response, "URL scan failed.");
              recordBackgroundTelemetry({
                level: "warn",
                surface: "extension-background",
                area: "projects",
                event: "project_scan_url.failed",
                flowId,
                message: reason,
                context: {
                  status: response.status,
                },
              });
              sendResponse({ ok: false, reason });
              return;
            }

            const result = (await response.json()) as {
              name: string | null;
              description: string | null;
              url: string;
            };
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "projects",
              event: "project_scan_url.succeeded",
              flowId,
              message: "Project URL scan completed from the extension.",
              context: {
                hasName: Boolean(result.name),
                hasDescription: Boolean(result.description),
              },
            });
            sendResponse({ ok: true, result });
          } catch (cause) {
            recordBackgroundTelemetry({
              level: "error",
              surface: "extension-background",
              area: "projects",
              event: "project_scan_url.exception",
              message: "Project URL scan threw an exception in the background worker.",
              error: cause,
            });
            sendResponse({
              ok: false,
              reason: cause instanceof Error ? cause.message : "URL scan failed.",
            });
          }
          return;
        }

        if (message.type === "RELAY_CREATE_PROJECT") {
          try {
            const flowId = message.payload.flowId ?? createFlowId("ext-project");
            const slug =
              message.payload.slug ?? slugify(message.payload.name).slice(0, 80);
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "projects",
              event: "project_create.started",
              flowId,
              message: "Received project creation request from the extension UI.",
              context: {
                name: message.payload.name,
                slug,
              },
            });
            const response = await relayFetch("/api/projects", {
              method: "POST",
              headers: {
                "x-relay-flow-id": flowId,
              },
              body: JSON.stringify({
                name: message.payload.name,
                slug,
                description: message.payload.description ?? null,
                projectUrl: message.payload.projectUrl ?? null,
              }),
            });
            console.log("[Relay BG] create project response status:", response.status);
            recordBackgroundTelemetry({
              level: response.ok ? "info" : "warn",
              surface: "extension-background",
              area: "projects",
              event: "project_create.api_response",
              flowId,
              message: `Project creation returned ${response.status}.`,
              context: {
                status: response.status,
              },
            });

            if (!response.ok) {
              const reason = await readErrorResponse(
                response,
                "Project creation failed.",
              );
              console.log("[Relay BG] create project failed:", reason);
              recordBackgroundTelemetry({
                level: "error",
                surface: "extension-background",
                area: "projects",
                event: "project_create.failed",
                flowId,
                message: reason,
                context: {
                  name: message.payload.name,
                  slug,
                },
              });
              sendResponse({ ok: false, reason });
              return;
            }

            const payload = (await response.json()) as {
              project: { id: string; name: string; slug?: string };
              onboarding?: RelayOnboardingState;
            };
            sessionDataCache = null;
            await setRelaySession({
              projectId: payload.project.id,
              assumedProjectId: payload.project.id,
              assumedProjectName: payload.project.name,
              onboarding:
                payload.onboarding ?? {
                  status: "completed",
                  completedProjectId: payload.project.id,
                  completedVia: "extension",
                  completedAt: new Date().toISOString(),
                },
            });
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "projects",
              event: "project_create.succeeded",
              flowId,
              message: `Created project ${payload.project.id} from extension onboarding.`,
              context: {
                projectId: payload.project.id,
                slug: payload.project.slug ?? slug,
              },
            });

            sendResponse({ ok: true, project: payload.project });
          } catch (cause) {
            recordBackgroundTelemetry({
              level: "error",
              surface: "extension-background",
              area: "projects",
              event: "project_create.exception",
              message: "Project creation threw an exception in the background worker.",
              error: cause,
            });
            sendResponse({
              ok: false,
              reason:
                cause instanceof Error
                  ? cause.message
                  : "Project creation failed.",
            });
          }
          return;
        }

        if (message.type === "RELAY_UPDATE_PROJECT") {
          try {
            const flowId = message.payload.flowId ?? createFlowId("ext-project-update");
            const response = await relayFetch(`/api/projects/${message.payload.projectId}`, {
              method: "PATCH",
              headers: { "x-relay-flow-id": flowId },
              body: JSON.stringify({
                name: message.payload.name,
                description: message.payload.description ?? null,
                projectUrl: message.payload.projectUrl ?? null,
              }),
            });
            if (!response.ok) {
              const reason = await readErrorResponse(response, "Project update failed.");
              sendResponse({ ok: false, reason });
              return;
            }
            const payload = (await response.json()) as {
              project: { id: string; name: string; description: string | null; projectUrl: string | null };
            };
            const session = await getRelaySession();
            const updatedOptions = session.projectOptions?.map((p) =>
              p.id === payload.project.id
                ? { ...p, name: payload.project.name, description: payload.project.description, projectUrl: payload.project.projectUrl }
                : p
            ) ?? [];
            sessionDataCache = null;
            await setRelaySession({
              projectOptions: updatedOptions,
              ...(session.assumedProjectId === payload.project.id
                ? { assumedProjectName: payload.project.name }
                : {}),
            });
            sendResponse({ ok: true, project: payload.project });
          } catch (cause) {
            sendResponse({ ok: false, reason: cause instanceof Error ? cause.message : "Project update failed." });
          }
          return;
        }

        if (message.type === "RELAY_DELETE_PROJECT") {
          try {
            const flowId = message.payload.flowId ?? createFlowId("ext-project-delete");
            const response = await relayFetch(`/api/projects/${message.payload.projectId}`, {
              method: "DELETE",
              headers: { "x-relay-flow-id": flowId },
            });
            if (!response.ok) {
              const reason = await readErrorResponse(response, "Project deletion failed.");
              sendResponse({ ok: false, reason });
              return;
            }
            const session = await getRelaySession();
            const remainingOptions = session.projectOptions?.filter((p) => p.id !== message.payload.projectId) ?? [];
            const wasActive = session.projectId === message.payload.projectId || session.assumedProjectId === message.payload.projectId;
            const nextProject = wasActive ? (remainingOptions[0] ?? null) : null;
            sessionDataCache = null;
            await setRelaySession({
              projectOptions: remainingOptions,
              ...(wasActive
                ? {
                    projectId: nextProject?.id ?? "",
                    assumedProjectId: nextProject?.id ?? "",
                    assumedProjectName: nextProject?.name ?? "",
                  }
                : {}),
            });
            sendResponse({ ok: true });
          } catch (cause) {
            sendResponse({ ok: false, reason: cause instanceof Error ? cause.message : "Project deletion failed." });
          }
          return;
        }

        if (message.type === "RELAY_LOG_TELEMETRY") {
          recordBackgroundTelemetry(message.payload);
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "RELAY_REFRESH_SESSION") {
          sessionDataCache = null;
          const payload = await loadSessionData();
          sendResponse({ ok: true, ...payload });
          return;
        }

        if (message.type === "RELAY_SIGN_OUT") {
          try {
            await clearRelaySession();
            if (chrome.storage?.local) {
              await chrome.storage.local.remove([
                "relay.routing.approvedAssociations",
                "relay.routing.ignoredChatKeys",
                "relay.routing.adjudications",
              ]);
            }
            sendResponse({ ok: true });
          } catch (cause) {
            sendResponse({
              ok: false,
              reason: cause instanceof Error ? cause.message : "Sign out failed.",
            });
          }
          return;
        }

        if (message.type === "RELAY_PAGE_STATE_UPDATE" && sender.tab?.id) {
          console.warn("[Relay BG] page state update", {
            tabId: sender.tab.id,
            supported: message.payload.supported,
            platform: message.payload.platform ?? null,
            pathname: message.payload.pathname ?? null,
            title: message.payload.title ?? null,
            turns: message.payload.turns ?? 0,
            promptReady: message.payload.promptReady ?? null,
            isFreshChat: message.payload.isFreshChat ?? null,
            isStable: message.payload.isStable ?? null,
            isStreaming: message.payload.isStreaming ?? null,
            signature: message.payload.captureSignature?.slice(0, 16) ?? null,
          });
          updateTabPageState(sender.tab.id, message.payload);
          await broadcastActiveProjectState(sender.tab.id);
          void syncTabRemoteState(sender.tab.id, {
            reason: "page_state_update",
          });
          void scheduleAutoCapture(sender.tab.id);
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "RELAY_GET_ACTIVE_PROJECT_STATE") {
          const tabId = message.payload?.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse(
              createEmptyActiveProjectState({
                message: "No supported AI tab is active.",
              }) satisfies RelayActiveProjectState,
            );
            return;
          }

          if (!tabStates.has(tabId)) {
            await requestPageStateFromTab(tabId);
          }

          const state = getOrCreateTabState(tabId);
          const session = await getRelaySession();
          hydrateTabStateFromSession(state, session);
          if (
            state.page.supported &&
            session.connected &&
            (state.remoteStatus === "unavailable" || !state.lastSuccessfulSyncAt)
          ) {
            state.remoteStatus =
              session.projectOptions.length > 0 || session.assumedProjectId
                ? "stale"
                : "loading";
          }

          sendResponse(await buildActiveProjectState(tabId));

          if (state.remoteStatus !== "ready" || !state.projectOptions.length) {
            void syncTabRemoteState(tabId, {
              force: true,
              reason: "active_state_request",
            });
          }
          return;
        }

        if (message.type === "RELAY_SET_ACTIVE_PROJECT") {
          const tabId = message.payload.tabId ?? sender.tab?.id ?? null;
          const state = tabId !== null ? getOrCreateTabState(tabId) : null;
          const pageState = state?.page?.supported
            ? state.page
            : tabId !== null
              ? await requestPageStateFromTab(tabId)
              : ({ supported: false } satisfies RelayPageState);
          const nextProjectName =
            state?.projectOptions.find(
              (project) => project.id === message.payload.projectId,
            )?.name ?? state?.projectName;

          await rememberProjectSelection(
            message.payload.projectId,
            tabId,
            pageState,
            nextProjectName,
          );
          if (state) {
            state.projectId = message.payload.projectId;
            state.projectName = nextProjectName ?? state.projectName;
            state.lastError = null;
            state.routingReview = null;
            state.lastRoutedSignature = null;
            state.associationSuppressed = false;
            if (state.chatAssociation.status === "none") {
              clearAssociationToast(state);
            }
          }
          invalidateProjectCache(message.payload.projectId);

          if (tabId !== null) {
            await syncTabRemoteState(tabId, {
              force: true,
              reason: "project_switch",
            });
            recordBackgroundTelemetry({
              level: "info",
              surface: "extension-background",
              area: "projects",
              event: "project_selected",
              message: `Selected project ${message.payload.projectId} in the extension.`,
              projectId: message.payload.projectId,
              tabId,
              context: {
                projectName: nextProjectName ?? null,
                associationAware: false,
              },
            });
            sendResponse(await buildActiveProjectState(tabId));
          } else {
            sendResponse({ ok: true });
          }
          return;
        }

        if (message.type === "RELAY_SET_CHAT_ASSOCIATION_PROJECT") {
          const tabId = message.payload.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse({
              ok: false,
              reason: "No supported tab was provided for chat association retargeting.",
            });
            return;
          }

          sendResponse(
            await retargetAssociation(
              tabId,
              message.payload.projectId,
              message.payload.source,
            ),
          );
          return;
        }

        if (message.type === "RELAY_DISMISS_CAPTURE_REVIEW") {
          const tabId = message.payload?.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse({
              ok: false,
              reason: "No supported tab was provided for review dismissal.",
            });
            return;
          }

          await dismissCaptureReview(tabId);
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "RELAY_SET_CHAT_ASSOCIATION_ARCHIVED") {
          const tabId = message.payload.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse({
              ok: false,
              reason: "No supported tab was provided for chat detachment.",
            });
            return;
          }

          await archiveChatAssociation(
            tabId,
            message.payload.projectId,
            message.payload.sessionId,
            message.payload.archived,
          );
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "RELAY_RESOLVE_ASSOCIATION_TOAST") {
          const tabId = message.payload.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse({
              ok: false,
              reason: "No supported tab was provided for association resolution.",
            });
            return;
          }

          sendResponse(
            await resolveAssociationToast(tabId, {
              action: message.payload.action,
              mode: message.payload.mode,
              projectId: message.payload.projectId,
            }),
          );
          return;
        }

        if (message.type === "RELAY_INSERT_PROJECT_BRIEF") {
          const tabId = message.payload?.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse({
              ok: false,
              reason: "No supported AI tab was provided for insertion.",
            });
            return;
          }

          sendResponse(
            await insertProjectBrief(
              tabId,
              message.payload?.projectId,
              message.payload?.source ?? "sidebar",
            ),
          );
          return;
        }

        if (message.type === "RELAY_PIN_SELECTION") {
          const tabId = message.payload.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse({
              ok: false,
              reason: "No supported tab was provided for saving.",
            });
            return;
          }

          const state = getOrCreateTabState(tabId);
          if (!state.projectId && !message.payload.projectId) {
            await syncTabRemoteState(tabId, {
              force: true,
              reason: "pin_needs_project",
            });
          }

          const selection = await chrome.tabs.sendMessage(tabId, {
            type: "RELAY_GET_SELECTION",
          });
          if (!selection?.ok || !selection.text) {
            sendResponse(
              selection ?? {
                ok: false,
                reason: "Select text in the page first.",
              },
            );
            return;
          }

          const result = await handleSaveSelectionToRelay({
            selectionText: selection.text,
            pageUrl: selection.metadata?.url ?? null,
            pageTitle: selection.metadata?.title ?? null,
            platform: selection.platform ?? state.page.platform ?? null,
            extraMetadata: selection.metadata ?? undefined,
            tabId,
            projectIdOverride: message.payload.projectId ?? null,
            trigger: "pin_selection",
          });

          sendResponse(
            result.ok
              ? { ok: true }
              : { ok: false, reason: result.reason ?? "Save to project failed." },
          );
          return;
        }

        if (message.type === "RELAY_CAPTURE_VISIBLE") {
          const tabId = message.payload.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse({
              ok: false,
              reason: "No supported tab was provided for capture.",
            });
            return;
          }

          sendResponse(
            await captureObservedChange(tabId, message.payload.projectId, {
              manualSelection: Boolean(message.payload.projectId),
              skipAssociationToast: false,
            }),
          );
          return;
        }

        if (message.type === "RELAY_TRIGGER_AUTO_CAPTURE") {
          const tabId = message.payload.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse({
              ok: false,
              reason: "No supported tab was provided for auto-capture.",
            });
            return;
          }

          sendResponse(await captureObservedChange(tabId));
          return;
        }

        if (message.type === "RELAY_GENERATE_BOOTSTRAP") {
          const response = await relayFetch(
            `/api/projects/${message.payload.projectId}/bootstrap`,
            {
              method: "POST",
              body: JSON.stringify({
                targetProfileKey: message.payload.targetProfileKey,
                kind: message.payload.kind,
                deep: message.payload.deep,
              }),
            },
          );

          if (!response.ok) {
            sendResponse({
              error: await readErrorResponse(
                response,
                "Project brief generation failed.",
              ),
            });
            return;
          }

          const payload = await response.json();
          if (payload?.stateStatus) {
            await setRelaySession({ stateStatus: payload.stateStatus });
          }
          sendResponse(payload);
          return;
        }

        const session = await getRelaySession();
        sendResponse(session);
      } catch (cause) {
        sendResponse({
          ok: false,
          error:
            cause instanceof Error ? cause.message : "Relay request failed.",
        });
      }
    })();

    return true;
  },
);

chrome.runtime.onMessageExternal.addListener(
  (
    message: any,
    _sender: unknown,
    sendResponse: (response?: unknown) => void,
  ) => {
    void (async () => {
      try {
        if (message?.type === "billing.refresh" || message?.type === "RELAY_BILLING_REFRESH") {
          sessionDataCache = null;
          dashboardCache.clear();
          try {
            await loadSessionData();
          } catch {
            // Ignored — next natural refresh will pick up the state.
          }
          sendResponse({ ok: true });
          return;
        }

        if (message?.type === "RELAY_SYNC_THEME") {
          const theme = message?.payload?.theme;
          if (theme !== "light" && theme !== "dark" && theme !== "system") {
            sendResponse({ ok: false, reason: "Unsupported theme mode." });
            return;
          }

          await setRelayThemeMode(theme);
          await broadcastThemeChange(theme);
          sendResponse({ ok: true });
          return;
        }

        if (message?.type === "RELAY_SYNC_USER_SETTINGS") {
          const nextSettings = message?.payload?.settings as
            | RemoteSettingsPayload["settings"]
            | undefined;
          if (!nextSettings || typeof nextSettings !== "object") {
            sendResponse({ ok: false, reason: "Missing settings payload." });
            return;
          }

          sessionDataCache = null;
          if (typeof nextSettings.autoCapture === "boolean") {
            await setRelaySession({ autoCapture: nextSettings.autoCapture });
          }
          await broadcastUserSettingsChange(nextSettings);

          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            if (!tab.id) continue;
            void syncTabRemoteState(tab.id, {
              force: true,
              reason: "settings_push",
            });
          }

          sendResponse({ ok: true });
          return;
        }

        if (message?.type !== "RELAY_CONNECT_GRANT") {
          sendResponse({ ok: false, reason: "Unsupported external message." });
          return;
        }
        sendResponse({
          ok: false,
          reason: "Extension web pairing has been removed. Use Google sign-in from the extension.",
        });
      } catch (cause) {
        sendResponse({
          ok: false,
          reason:
            cause instanceof Error
              ? cause.message
              : "Extension pairing failed.",
        });
      }
    })();

    return true;
  },
);
