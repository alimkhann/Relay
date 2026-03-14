import { createFlowId } from "@relay/shared/utils/telemetry";
import { slugify } from "@relay/shared/utils/text";
import type {
  ProjectStateStatusDto,
  RelayOnboardingState,
  SupportedPlatform,
} from "@relay/shared";

import type {
  RelayActiveProjectState,
  RelayAssociationToastPayload,
  RelayChatAssociation,
  RelayContextPreview,
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
  readApprovedAssociations,
  rememberApprovedAssociation,
  rememberIgnoredChatKey,
  removeApprovedAssociationBySession,
} from "../storage/routing";
import {
  clearRelaySession,
  getRelaySession,
  setRelaySession,
} from "../storage/session";
import { setRelayThemeMode, type RelayThemeMode } from "../storage/theme";
import { relayFetch } from "../utils/api";
import { resolveTargetProfile } from "../utils/target-profile";
import {
  buildSavedAssociationFromMemory,
  buildHeldReviewAssociation,
  buildPendingAutoSaveAssociation,
  getPendingAssociationRemainingMs,
  pausePendingAutoSaveAssociation,
  resumePendingAutoSaveAssociation,
  resolveAssociationProjectName,
  resolveAssociationToastAction,
  type PendingAssociationState,
} from "./association-workflow";
import {
  buildAssociationKey,
  evaluateProjectRouting,
  findApprovedAssociationMatch,
  type RelayRoutingDecision,
  type RelayBoundProjectSignal,
} from "./routing";
import {
  createEmptyActiveProjectState,
  createEmptyChatAssociation,
  createEmptyContextPreview,
  createEmptyTrustMetadata,
  deriveRelayActiveProjectState,
  looksLikeFreshChatRoute,
  shouldScheduleAutoCapture,
} from "./tab-state";
import {
  flushBackgroundTelemetry,
  initializeBackgroundTelemetry,
  recordBackgroundTelemetry,
} from "./telemetry";

interface RemoteSettingsPayload {
  settings: {
    autoCapture: boolean;
    defaultTargetProfileKey: string;
    showSidepanelOnSupportedSites?: boolean;
  };
}

interface RemoteSettingsResponsePayload {
  settings: { settings: RemoteSettingsPayload["settings"] };
  onboarding?: RelayOnboardingState;
}

interface ProjectDashboardPayload {
  stateStatus?: ProjectStateStatusDto;
  projectState?: {
    updatedAt?: string | null;
    projectOverview?: string | null;
    currentObjective?: string | null;
    recentProgress?: string | null;
    decisions?: string[];
    constraints?: string[];
    openTasks?: string[];
  } | null;
  derivedProjectState?: {
    decisions?: string[];
    constraints?: string[];
    openTasks?: string[];
  } | null;
  stateOverrides?: {
    hiddenDecisions?: string[];
    hiddenConstraints?: string[];
    hiddenOpenTasks?: string[];
  } | null;
  recentSessions?: Array<{
    id: string;
    url: string;
    pageFingerprint?: string | null;
    captureSignature?: string | null;
    capturedAt?: string;
    isArchived?: boolean;
    archivedAt?: string | null;
  }>;
  sessionHistory?: Array<{
    id: string;
    url: string;
    pageFingerprint?: string | null;
    captureSignature?: string | null;
    capturedAt?: string;
    isArchived?: boolean;
    archivedAt?: string | null;
  }>;
  memory?: Array<{
    id: string;
    type?: string;
    content?: string;
    updatedAt?: string;
  }>;
  packets?: Array<{ createdAt?: string | null }>;
}

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
  capturePending: boolean;
  captureTimer: ReturnType<typeof setTimeout> | null;
  pendingAssociation: PendingAssociationState | null;
  pendingAssociationTimer: ReturnType<typeof setTimeout> | null;
  lastObservedSignature: string | null;
  lastObservedTurns: number;
  lastCapturedSignature: string | null;
  lastCapturedTurns: number;
  lastRoutedSignature: string | null;
}

const tabStates = new Map<number, RelayTabState>();
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
  };
  fetchedAt: number;
} | null = null;

const SESSION_CACHE_TTL_MS = 15_000;
const DASHBOARD_CACHE_TTL_MS = 6_000;
const REMOTE_RETRY_DELAY_MS = 300;
const REMOTE_RETRY_BACKOFF_MS = [5_000, 15_000];

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
    apiBase:
      session.apiBase ||
      process.env.PLASMO_PUBLIC_RELAY_API_BASE ||
      "http://localhost:3000",
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

async function retryRemote<T>(
  task: () => Promise<T>,
  attempts = 2,
): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await task();
    } catch (cause) {
      lastError = cause;
      if (index < attempts - 1) {
        await wait(REMOTE_RETRY_DELAY_MS);
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

  const savedContextCount =
    (dashboard?.memory?.length ?? 0) +
    (dashboard?.projectState?.decisions?.length ?? 0) +
    (dashboard?.projectState?.constraints?.length ?? 0) +
    (dashboard?.projectState?.openTasks?.length ?? 0);

  return {
    updatedAt,
    updatedLabel: formatUpdatedLabel(updatedAt),
    recentChatCount: dashboard?.recentSessions?.length ?? 0,
    savedContextCount,
  };
}

function buildDashboardContextPreview(
  dashboard: ProjectDashboardPayload | null | undefined,
): RelayContextPreview {
  if (!dashboard) {
    return createEmptyContextPreview();
  }

  const hiddenDecisions = new Set(
    (dashboard.stateOverrides?.hiddenDecisions ?? []).map((item) =>
      item.toLowerCase(),
    ),
  );
  const hiddenConstraints = new Set(
    (dashboard.stateOverrides?.hiddenConstraints ?? []).map((item) =>
      item.toLowerCase(),
    ),
  );
  const hiddenTasks = new Set(
    (dashboard.stateOverrides?.hiddenOpenTasks ?? []).map((item) =>
      item.toLowerCase(),
    ),
  );

  const manualDecisions = (dashboard.memory ?? [])
    .filter((item) => item.type === "decision" && item.content)
    .map((item) => ({
      key: `manual:decision:${item.id}`,
      text: item.content ?? "",
      source: "manual" as const,
      memoryId: item.id,
    }));
  const manualConstraints = (dashboard.memory ?? [])
    .filter((item) => item.type === "constraint" && item.content)
    .map((item) => ({
      key: `manual:constraint:${item.id}`,
      text: item.content ?? "",
      source: "manual" as const,
      memoryId: item.id,
    }));
  const manualTasks = (dashboard.memory ?? [])
    .filter((item) => item.type === "task" && item.content)
    .map((item) => ({
      key: `manual:task:${item.id}`,
      text: item.content ?? "",
      source: "manual" as const,
      memoryId: item.id,
    }));

  const derivedDecisions = (dashboard.derivedProjectState?.decisions ?? [])
    .filter((item) => !hiddenDecisions.has(item.toLowerCase()))
    .map((text) => ({
      key: `derived:decision:${text}`,
      text,
      source: "derived" as const,
      memoryId: null,
    }));
  const derivedConstraints = (dashboard.derivedProjectState?.constraints ?? [])
    .filter((item) => !hiddenConstraints.has(item.toLowerCase()))
    .map((text) => ({
      key: `derived:constraint:${text}`,
      text,
      source: "derived" as const,
      memoryId: null,
    }));
  const derivedTasks = (dashboard.derivedProjectState?.openTasks ?? [])
    .filter((item) => !hiddenTasks.has(item.toLowerCase()))
    .map((text) => ({
      key: `derived:task:${text}`,
      text,
      source: "derived" as const,
      memoryId: null,
    }));

  return {
    decisions: [...manualDecisions, ...derivedDecisions].slice(0, 5),
    constraints: [...manualConstraints, ...derivedConstraints].slice(0, 5),
    tasks: [...manualTasks, ...derivedTasks].slice(0, 5),
  };
}

function findMatchingSession(
  sessions: ProjectDashboardPayload["sessionHistory"],
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
      reason: `Relay will save this chat to ${projectName} in 20 seconds unless you cancel.`,
    };
  } else if (state.chatAssociation.status === "held") {
    state.chatAssociation = {
      ...state.chatAssociation,
      projectId,
      projectName,
      reason: `Relay wants confirmation before saving this chat to ${projectName}.`,
    };
  }

  if (state.pendingAssociation) {
    state.pendingAssociation = {
      ...state.pendingAssociation,
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
    capturePending: false,
    captureTimer: null,
    pendingAssociation: null,
    pendingAssociationTimer: null,
    lastObservedSignature: null,
    lastObservedTurns: 0,
    lastCapturedSignature: null,
    lastCapturedTurns: 0,
    lastRoutedSignature: null,
  };
}

function getOrCreateTabState(tabId: number) {
  const existing = tabStates.get(tabId);
  if (existing) return existing;

  const nextState = createTabState(tabId);
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

function clearPendingAssociationTimer(state: RelayTabState) {
  if (state.pendingAssociationTimer) {
    clearTimeout(state.pendingAssociationTimer);
    state.pendingAssociationTimer = null;
  }
}

function clearPendingAssociation(
  state: RelayTabState,
  options: { clearChatAssociation?: boolean } = {},
) {
  clearPendingAssociationTimer(state);
  state.pendingAssociation = null;
  if (options.clearChatAssociation && state.chatAssociation.status === "pending") {
    state.chatAssociation = createEmptyChatAssociation();
  }
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
  state.lastCapturedSignature =
    state.page.captureSignature ?? state.lastObservedSignature;
  state.lastCapturedTurns = state.page.turns ?? state.lastObservedTurns;
  state.lastRoutedSignature = state.page.captureSignature ?? buildAssociationKey(state.page);
  state.projectId = association.projectId;
  state.projectName = association.projectName;
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

function startPendingAssociationTimer(tabId: number, state: RelayTabState) {
  const pendingAssociation = state.pendingAssociation;
  if (!pendingAssociation || pendingAssociation.mode !== "auto_save" || pendingAssociation.paused) {
    return;
  }

  clearPendingAssociationTimer(state);

  const delay = getPendingAssociationRemainingMs(pendingAssociation);
  pendingAssociation.expiresAt = Date.now() + delay;
  pendingAssociation.remainingMs = null;
  pendingAssociation.paused = false;

  state.pendingAssociationTimer = setTimeout(() => {
    state.pendingAssociationTimer = null;
    const latestPendingAssociation = state.pendingAssociation;
    const stillPending =
      latestPendingAssociation &&
      latestPendingAssociation.mode === "auto_save" &&
      !latestPendingAssociation.paused &&
      latestPendingAssociation.captureSignature === pendingAssociation.captureSignature;

    if (!stillPending) {
      return;
    }

    const nextProjectId = latestPendingAssociation.projectId;
    clearPendingAssociation(state, { clearChatAssociation: true });
    void captureObservedChange(tabId, nextProjectId, {
      manualSelection: false,
      skipAssociationToast: true,
    });
  }, delay);
}

function clearTabState(tabId: number) {
  const state = tabStates.get(tabId);
  if (!state) return;

  clearRetryTimer(state);
  clearCaptureTimer(state);
  clearPendingAssociationTimer(state);
  tabStates.delete(tabId);
}

async function readErrorResponse(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
    };
    return payload.error ?? payload.message ?? fallback;
  } catch {
    return fallback;
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
    const [projectsResponse, settingsResponse] = await retryRemote(() =>
      Promise.all([relayFetch("/api/projects"), relayFetch("/api/settings")]),
    );

    if (!projectsResponse.ok) {
      const message = await readErrorResponse(
        projectsResponse,
        "Failed to load projects.",
      );
      if (
        projectsResponse.status === 401 ||
        projectsResponse.status === 403 ||
        isAuthFailureMessage(message)
      ) {
        await resetStoredSession(message);
        return {
          connected: false,
          projects: [] as RelayProjectOption[],
          settings: null as RemoteSettingsPayload | null,
          onboarding: createPendingOnboardingState(),
        };
      }

      throw new Error(message);
    }

    if (!settingsResponse.ok) {
      const message = await readErrorResponse(
        settingsResponse,
        "Failed to load settings.",
      );
      if (
        settingsResponse.status === 401 ||
        settingsResponse.status === 403 ||
        isAuthFailureMessage(message)
      ) {
        await resetStoredSession(message);
        return {
          connected: false,
          projects: [] as RelayProjectOption[],
          settings: null as RemoteSettingsPayload | null,
          onboarding: createPendingOnboardingState(),
        };
      }

      throw new Error(message);
    }

    const projectsPayload = (await projectsResponse.json()) as {
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
    };
    const settingsPayload =
      (await settingsResponse.json()) as RemoteSettingsResponsePayload;
    const onboarding = settingsPayload.onboarding ?? createPendingOnboardingState();

    const projects = projectsPayload.projects.map((project) => ({
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
      projectId: nextProjectId,
      autoCapture: settingsPayload.settings.settings.autoCapture,
      targetMode: session.targetMode ?? "auto",
      targetProfileKey:
        session.targetMode === "manual" ? session.targetProfileKey : "",
      projectOptions: projects,
      onboarding,
    });

    const data = {
      connected: true,
      projects,
      settings: settingsPayload.settings,
      onboarding,
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

async function requestPageStateFromTab(tabId: number) {
  try {
    const page = ((await chrome.tabs.sendMessage(tabId, {
      type: "RELAY_PAGE_STATE",
    })) as RelayPageState | undefined) ?? { supported: false };
    updateTabPageState(tabId, page);
    return page;
  } catch {
    const page = { supported: false } satisfies RelayPageState;
    updateTabPageState(tabId, page);
    return page;
  }
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
    onboarding,
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
  state.remoteStatus = state.lastSuccessfulSyncAt ? "stale" : "loading";
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
    const preserveLocalAssociation =
      state.chatAssociation.status === "held" ||
      state.chatAssociation.status === "ignored" ||
      state.chatAssociation.status === "pending" ||
      state.chatAssociation.status === "archived";
    if (!preserveLocalAssociation && nextChatAssociation.status !== "none") {
      state.chatAssociation = nextChatAssociation;
    } else if (
      state.chatAssociation.status !== "held" &&
      state.chatAssociation.status !== "ignored" &&
      state.chatAssociation.status !== "pending" &&
      state.chatAssociation.status !== "archived"
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
  } catch (cause) {
    state.lastError =
      cause instanceof Error ? cause.message : "Failed to fetch";
    state.remoteStatus =
      state.lastSuccessfulSyncAt || state.projectId || state.stateStatus
        ? "stale"
        : "unavailable";
    scheduleRetry(tabId);
  } finally {
    state.syncInFlight = false;
    await broadcastActiveProjectState(tabId);
  }
}

function updateTabPageState(tabId: number, page: RelayPageState) {
  const state = getOrCreateTabState(tabId);
  const routeChanged =
    state.page.url !== page.url || state.page.pathname !== page.pathname;
  const signatureChanged =
    state.page.captureSignature !== page.captureSignature &&
    Boolean(state.pendingAssociation);

  state.page = page;
  state.lastObservedSignature = page.captureSignature ?? null;
  state.lastObservedTurns = page.turns ?? 0;

  if (signatureChanged) {
    clearPendingAssociation(state, { clearChatAssociation: true });
  }

  if (routeChanged) {
    state.lastError = null;
    state.capturePending = false;
    state.chatAssociation = createEmptyChatAssociation();
    state.routingReview = null;
    state.lastRoutedSignature = null;
    clearCaptureTimer(state);
    clearPendingAssociation(state);
  }
}

async function captureTab(projectId: string, tabId: number) {
  const result = await chrome.tabs.sendMessage(tabId, {
    type: "RELAY_CAPTURE_VISIBLE",
    payload: { projectId, tabId },
  });

  if (!result?.ok || !result.capture) {
    return result ?? { ok: false, reason: "Capture failed." };
  }

  const response = await relayFetch("/api/captures", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      ...result.capture,
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      reason: await readErrorResponse(response, "Capture request failed."),
    };
  }

  const payload = await response.json();

  return {
    ok: true,
    sessionId: payload.session?.id ?? null,
    turns: payload.turns?.length ?? result.capture.turns?.length ?? 0,
    digestQueued: Boolean(payload.digestQueued),
    digestStrategy: payload.digestStrategy ?? "skip",
    stateStatus: payload.stateStatus ?? null,
  };
}

async function showAssociationToast(
  tabId: number,
  payload: RelayAssociationToastPayload,
) {
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
    state.chatAssociation = {
      status: "archived",
      projectId,
      projectName: state.projectName,
      sessionId,
      reason: "This chat was detached from the project.",
      capturedAt: new Date().toISOString(),
    };
  } else {
    state.chatAssociation = {
      status: "saved",
      projectId,
      projectName: state.projectName,
      sessionId,
      reason: "This chat is currently saved to the project.",
      capturedAt: new Date().toISOString(),
    };
  }

  invalidateProjectCache(projectId);
  await syncTabRemoteState(tabId, {
    force: true,
    reason: archived ? "chat_detached" : "chat_restored",
  });
}

async function dismissCaptureReview(tabId: number) {
  const state = getOrCreateTabState(tabId);
  const chatKey = buildAssociationKey(state.page);
  clearPendingAssociation(state, { clearChatAssociation: true });
  await rememberIgnoredChatKey(chatKey);
  state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
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
      reasons: ["This chat was already dismissed from automatic capture."]
    };
  }

  const approvedAssociations =
    approvedAssociationsInput ?? (await readApprovedAssociations());
  return evaluateProjectRouting({
    page: state.page,
    projects: state.projectOptions,
    selectedProjectId: state.projectId,
    lastTabProjectId: state.projectId,
    boundProject: state.boundProject,
    approvedAssociations
  });
}

async function schedulePendingAutoSaveAssociation(
  tabId: number,
  projectId: string,
  projectName: string,
) {
  const state = getOrCreateTabState(tabId);
  const session = await getRelaySession();
  const captureSignature = state.page.captureSignature ?? null;
  const { chatAssociation, toast, pending } = buildPendingAutoSaveAssociation({
    projectId,
    projectName,
    projectOptions: state.projectOptions.length
      ? state.projectOptions
      : session.projectOptions,
    captureSignature,
  });

  clearPendingAssociation(state);
  state.lastRoutedSignature =
    state.page.captureSignature ?? buildAssociationKey(state.page);
  state.chatAssociation = chatAssociation;
  state.pendingAssociation = pending;
  await broadcastActiveProjectState(tabId);
  await showAssociationToast(tabId, toast);
  startPendingAssociationTimer(tabId, state);
}

async function showHeldAssociationToast(
  tabId: number,
  projectId: string,
  projectName: string,
) {
  const state = getOrCreateTabState(tabId);
  const session = await getRelaySession();
  const { chatAssociation, toast } = buildHeldReviewAssociation({
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
  state.chatAssociation = chatAssociation;
  await broadcastActiveProjectState(tabId);
  await showAssociationToast(tabId, toast);
}

async function setAssociationToastPaused(
  tabId: number,
  payload: {
    paused: boolean;
    mode: "auto_save" | "held_review";
    projectId: string;
  },
) {
  const state = getOrCreateTabState(tabId);

  if (payload.mode !== "auto_save") {
    return { ok: true, paused: payload.paused };
  }

  const pendingAssociation = state.pendingAssociation;
  if (
    !pendingAssociation ||
    pendingAssociation.mode !== "auto_save" ||
    pendingAssociation.projectId !== payload.projectId
  ) {
    return { ok: false, reason: "No pending auto-save toast is active for this chat." };
  }

  if (payload.paused) {
    state.pendingAssociation = pausePendingAutoSaveAssociation(pendingAssociation);
    clearPendingAssociationTimer(state);
  } else {
    state.pendingAssociation = resumePendingAutoSaveAssociation(pendingAssociation);
    startPendingAssociationTimer(tabId, state);
  }

  return {
    ok: true,
    paused: state.pendingAssociation.paused,
    expiresAt: state.pendingAssociation.expiresAt,
  };
}

async function resolveAssociationToast(
  tabId: number,
  payload: {
    action: "approve" | "cancel";
    mode: "auto_save" | "held_review";
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
    payload.mode === "held_review" &&
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
    pendingAssociation: state.pendingAssociation,
  };

  await setSessionProjectTarget(project.projectId, project.projectName);

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
      state.pendingAssociation = previousState.pendingAssociation;
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
  } = {},
) {
  const state = getOrCreateTabState(tabId);
  const session = await getRelaySession();
  const chatKey = buildAssociationKey(state.page);
  const manualSelection = Boolean(options.manualSelection);
  const skipAssociationToast = Boolean(options.skipAssociationToast);
  const previousAssociationProjectName = state.chatAssociation.projectName;
  state.capturePending = true;
  await broadcastActiveProjectState(tabId);

  try {
    if (!session.connected || !session.token || (!explicitProjectId && !session.autoCapture)) {
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
        state.routingReview = {
          confidence: "high",
          score: 100,
          reasons: ["This chat is already associated with the project."],
        };
        clearPendingAssociation(state);
        state.lastCapturedSignature =
          state.page.captureSignature ?? state.lastObservedSignature;
        state.lastCapturedTurns = state.page.turns ?? state.lastObservedTurns;
        state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
        return {
          ok: true,
          restored: true,
          captured: false,
          projectId,
          sessionId: state.chatAssociation.sessionId ?? null,
          reason: "This chat is already associated with the project.",
        };
      } else if (state.chatAssociation.status === "archived") {
        clearPendingAssociation(state, { clearChatAssociation: false });
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
        await setSessionProjectTarget(
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
          clearPendingAssociation(state, { clearChatAssociation: true });
          state.lastRoutedSignature = state.page.captureSignature ?? chatKey;
          state.chatAssociation = {
            status: "ignored",
            projectId: null,
            projectName: null,
            sessionId: null,
            reason:
              routingDecision.reasons[0] ??
              "Relay skipped this chat because it did not clearly map to a project.",
            capturedAt: null,
          };
          return {
            ok: true,
            ignored: true,
            captured: false,
            reason: routingDecision.reasons[0] ?? "Ignored this chat.",
          };
        }

        if (
          routingDecision.mode === "hold" &&
          routingDecision.candidateProjectId &&
          routingDecision.candidateProjectName
        ) {
          await clearIgnoredChatKey(chatKey);
          await showHeldAssociationToast(
            tabId,
            routingDecision.candidateProjectId,
            routingDecision.candidateProjectName,
          );
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
      return { ok: false, reason: "Choose a project first." };
    }

    if (
      autoAssociated &&
      !skipAssociationToast &&
      !explicitProjectId
    ) {
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

      await clearIgnoredChatKey(chatKey);
      await schedulePendingAutoSaveAssociation(tabId, projectId, projectName);
      return {
        ok: true,
        pending: true,
        captured: false,
        projectId,
        reason: `Relay will save this chat to ${projectName} unless you cancel.`,
      };
    }

    const result = await captureTab(projectId, tabId);
    if (result?.ok) {
      clearPendingAssociation(state);
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
      state.projectId = projectId;
      state.projectName = projectName || state.projectName;
      state.stateStatus = result.stateStatus ?? state.stateStatus;
      state.chatAssociation = {
        status: "saved",
        projectId,
        projectName: associationProjectName,
        sessionId: result.sessionId ?? null,
        reason: "This chat is currently saved to the project.",
        capturedAt: new Date().toISOString(),
      };
      invalidateProjectCache(projectId);
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

    state.lastError = result?.reason ?? "Capture failed.";
    return result ?? { ok: false, reason: "Capture failed." };
  } finally {
    state.capturePending = false;
    clearCaptureTimer(state);
    await broadcastActiveProjectState(tabId);
  }
}

function scheduleAutoCapture(
  tabId: number,
  options: { immediate?: boolean } = {},
) {
  const state = getOrCreateTabState(tabId);
  const currentSignature = state.page.captureSignature ?? null;

  if (
    (currentSignature && currentSignature === state.lastRoutedSignature) ||
    !shouldScheduleAutoCapture({
      page: state.page,
      capturePending: state.capturePending,
      lastCapturedSignature: state.lastCapturedSignature,
      lastCapturedTurns: state.lastCapturedTurns,
    })
  ) {
    return;
  }

  if (state.captureTimer) {
    return;
  }

  state.capturePending = true;
  void broadcastActiveProjectState(tabId);

  state.captureTimer = setTimeout(
    () => {
      state.captureTimer = null;
      void captureObservedChange(tabId);
    },
    options.immediate ? 0 : 120,
  );
}

async function insertProjectBrief(tabId: number, explicitProjectId?: string) {
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
    }),
  });

  if (!response.ok) {
    const reason = await readErrorResponse(
      response,
      "Project brief generation failed.",
    );
    state.lastError = reason;
    state.remoteStatus = state.lastSuccessfulSyncAt ? "stale" : "unavailable";
    await broadcastActiveProjectState(tabId);
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
    return { ok: false, reason: inserted?.reason ?? "Insert failed." };
  }

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

  await syncTabRemoteState(tabId, { force: true, reason: "insert_complete" });

  return {
    ok: true,
    limitedMode,
    stateStatus: generated.stateStatus ?? null,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);
});

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
  void syncTabRemoteState(activeInfo.tabId, {
    force: true,
    reason: "tab_focus",
  });

  const state = tabStates.get(activeInfo.tabId);
  if (
    state &&
    state.lastObservedSignature &&
    state.lastObservedSignature !== state.lastCapturedSignature
  ) {
    scheduleAutoCapture(activeInfo.tabId, { immediate: true });
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
    await insertProjectBrief(tab.id);
  })();
});

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
            const flowId = message.payload?.flowId ?? createFlowId("ext-dashboard");
            const session = await getRelaySession();
            if (!session.token) {
              sendResponse({ ok: false, reason: "Sign in to Relay first." });
              return;
            }

            let googleTokens;
            try {
              googleTokens = await requestGoogleIdentityTokens({
                interactive: false,
                prompt: "none",
              });
            } catch {
              googleTokens = await requestGoogleIdentityTokens({
                interactive: true,
                prompt: "select_account",
              });
            }

            const apiBase =
              session.apiBase ||
              process.env.PLASMO_PUBLIC_RELAY_API_BASE ||
              "http://localhost:3000";
            const nextUrl = new URL(message.payload?.nextPath ?? "/dashboard", apiBase);
            nextUrl.searchParams.set("extensionId", chrome.runtime.id);
            const response = await fetch(`${apiBase}/api/extension/browser-handoff/start`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${session.token}`,
                "x-relay-flow-id": flowId,
              },
              body: JSON.stringify({
                googleAccessToken: googleTokens.accessToken,
                googleIdToken: googleTokens.idToken,
                nextPath: `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
              }),
            });

            if (!response.ok) {
              sendResponse({
                ok: false,
                reason: await readErrorResponse(
                  response,
                  "Failed to open the Relay dashboard.",
                ),
              });
              return;
            }

            const payload = (await response.json()) as { url: string };
            await chrome.tabs.create({ url: payload.url });
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
            const apiBase =
              session.apiBase ||
              process.env.PLASMO_PUBLIC_RELAY_API_BASE ||
              "http://localhost:3000";
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
              sendResponse({ ok: false, reason });
              return;
            }

            const payload = (await response.json()) as {
              token: string;
              apiBase: string;
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

            sessionDataCache = null;
            await setRelaySession({
              apiBase: payload.apiBase,
              token: payload.token,
              projectId: payload.projectId,
              targetMode: "auto",
              targetProfileKey: "",
              resolvedTargetProfileKey: "",
              connected: true,
              autoCapture: payload.settings?.settings?.autoCapture ?? true,
              limitedMode: false,
              lastStatus: "Signed in with Google.",
              stateStatus: null,
              assumedProjectId: payload.projectId,
              assumedProjectName: "",
              trust: createEmptyTrustMetadata(),
              projectOptions: payload.projects ?? [],
              onboarding: payload.onboarding ?? createPendingOnboardingState(),
            });
            const storedSession = await getRelaySession();
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

        if (message.type === "RELAY_LOG_TELEMETRY") {
          recordBackgroundTelemetry(message.payload);
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "RELAY_REFRESH_SESSION") {
          const payload = await loadSessionData();
          sendResponse({ ok: true, ...payload });
          return;
        }

        if (message.type === "RELAY_PAGE_STATE_UPDATE" && sender.tab?.id) {
          updateTabPageState(sender.tab.id, message.payload);
          await broadcastActiveProjectState(sender.tab.id);
          void syncTabRemoteState(sender.tab.id, {
            reason: "page_state_update",
          });
          scheduleAutoCapture(sender.tab.id);
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
            state.remoteStatus = "loading";
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
          }
          invalidateProjectCache(message.payload.projectId);

          if (tabId !== null) {
            await syncTabRemoteState(tabId, {
              force: true,
              reason: "project_switch",
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

        if (message.type === "RELAY_SET_ASSOCIATION_TOAST_PAUSED") {
          const tabId = message.payload.tabId ?? sender.tab?.id;
          if (!tabId) {
            sendResponse({
              ok: false,
              reason: "No supported tab was provided for toast timer control.",
            });
            return;
          }

          sendResponse(
            await setAssociationToastPaused(tabId, {
              paused: message.payload.paused,
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
            await insertProjectBrief(tabId, message.payload?.projectId),
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

          const projectId =
            message.payload.projectId || getOrCreateTabState(tabId).projectId;
          if (!projectId) {
            sendResponse({ ok: false, reason: "Choose a project first." });
            return;
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

          const response = await relayFetch(
            `/api/projects/${projectId}/memory`,
            {
              method: "POST",
              body: JSON.stringify({
                type: "note",
                pinned: true,
                title: `Saved from ${selection.platform ?? "AI chat"}`,
                content: selection.text,
                metadata: selection.metadata ?? {},
              }),
            },
          );

          if (!response.ok) {
            sendResponse({
              ok: false,
              reason: await readErrorResponse(
                response,
                "Save to project failed.",
              ),
            });
            return;
          }

          await rememberProjectSelection(
            projectId,
            tabId,
            state.page,
            state.projectName,
          );
          invalidateProjectCache(projectId);
          await syncTabRemoteState(tabId, {
            force: true,
            reason: "save_to_project",
          });
          sendResponse({ ok: true });
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
              skipAssociationToast: Boolean(message.payload.projectId),
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
