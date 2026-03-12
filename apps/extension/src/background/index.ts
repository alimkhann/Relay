import type { ProjectStateStatusDto } from "@relay/shared";

import type {
  RelayActiveProjectState,
  RelayMessage,
  RelayPageState,
  RelayProjectOption,
  RelayRemoteStatus,
  RelayTrustMetadata,
} from "../messaging/contracts";
import { getRelaySession, setRelaySession } from "../storage/session";
import { relayFetch } from "../utils/api";
import { resolveTargetProfile } from "../utils/target-profile";
import {
  createEmptyActiveProjectState,
  createEmptyTrustMetadata,
  deriveRelayActiveProjectState,
  looksLikeFreshChatRoute,
  RELAY_SHORTCUT_LABEL,
  shouldScheduleAutoCapture,
} from "./tab-state";

interface RemoteSettingsPayload {
  settings: {
    autoCapture: boolean;
    defaultTargetProfileKey: string;
    showSidepanelOnSupportedSites?: boolean;
  };
}

interface ProjectDashboardPayload {
  stateStatus?: ProjectStateStatusDto;
  projectState?: {
    updatedAt?: string | null;
    decisions?: string[];
    constraints?: string[];
    openTasks?: string[];
  } | null;
  recentSessions?: Array<unknown>;
  memory?: Array<unknown>;
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
  showCue: boolean;
  remoteStatus: RelayRemoteStatus;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  retryDelayMs: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  syncInFlight: boolean;
  capturePending: boolean;
  captureTimer: ReturnType<typeof setTimeout> | null;
  lastObservedSignature: string | null;
  lastObservedTurns: number;
  lastCapturedSignature: string | null;
  lastCapturedTurns: number;
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
  };
  fetchedAt: number;
} | null = null;

const SESSION_CACHE_TTL_MS = 15_000;
const DASHBOARD_CACHE_TTL_MS = 6_000;
const REMOTE_RETRY_DELAY_MS = 300;
const REMOTE_RETRY_BACKOFF_MS = [5_000, 15_000];

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

function createTabState(tabId: number): RelayTabState {
  return {
    tabId,
    page: { supported: false },
    projectId: null,
    projectName: null,
    projectOptions: [],
    trust: createEmptyTrustMetadata(),
    stateStatus: null,
    showCue: true,
    remoteStatus: "unavailable",
    lastSuccessfulSyncAt: null,
    lastError: null,
    retryDelayMs: 0,
    retryTimer: null,
    syncInFlight: false,
    capturePending: false,
    captureTimer: null,
    lastObservedSignature: null,
    lastObservedTurns: 0,
    lastCapturedSignature: null,
    lastCapturedTurns: 0,
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

function clearTabState(tabId: number) {
  const state = tabStates.get(tabId);
  if (!state) return;

  clearRetryTimer(state);
  clearCaptureTimer(state);
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
      throw new Error(
        await readErrorResponse(projectsResponse, "Failed to load projects."),
      );
    }

    if (!settingsResponse.ok) {
      throw new Error(
        await readErrorResponse(settingsResponse, "Failed to load settings."),
      );
    }

    const projectsPayload = (await projectsResponse.json()) as {
      projects: Array<{ id: string; name: string }>;
    };
    const settingsPayload = (await settingsResponse.json()) as {
      settings: { settings: RemoteSettingsPayload["settings"] };
    };

    const projects = projectsPayload.projects.map((project) => ({
      id: project.id,
      name: project.name,
    }));
    const nextProjectId =
      session.projectId &&
      projects.some((project) => project.id === session.projectId)
        ? session.projectId
        : (projects[0]?.id ?? "");

    await setRelaySession({
      connected: true,
      projectId: nextProjectId,
      autoCapture: settingsPayload.settings.settings.autoCapture,
      targetMode: session.targetMode ?? "auto",
      targetProfileKey:
        session.targetMode === "manual" ? session.targetProfileKey : "",
    });

    const data = {
      connected: true,
      projects,
      settings: settingsPayload.settings,
    };

    sessionDataCache = {
      token: session.token,
      data,
      fetchedAt: Date.now(),
    };

    return data;
  } catch (cause) {
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
      };
    } | null;
  };

  return payload.binding ?? null;
}

async function resolveActiveProject(tabId: number, pageState: RelayPageState) {
  const session = await getRelaySession();
  const remote = await loadSessionData();
  const bound = remote.connected
    ? await resolveBoundProject(tabId, pageState)
    : null;
  const fallbackProject =
    remote.projects.find((project) => project.id === session.projectId) ??
    remote.projects[0] ??
    null;
  const activeProject = bound?.project ?? fallbackProject;

  return {
    connected: remote.connected,
    projects: remote.projects,
    settings: remote.settings,
    activeProject,
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

  return deriveRelayActiveProjectState({
    connected: session.connected && Boolean(session.token),
    projectId: state.projectId,
    projectName: state.projectName,
    projectOptions: state.projectOptions,
    showCue: state.showCue,
    page: state.page,
    stateStatus: state.stateStatus,
    trust: state.trust,
    remoteStatus: state.remoteStatus,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    capturePending: state.capturePending,
    lastError: state.lastError,
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
    const { connected, projects, activeProject, settings } =
      await resolveActiveProject(tabId, state.page);
    const dashboard = activeProject
      ? await fetchProjectDashboard(activeProject.id)
      : null;
    const trust = dashboard ? buildTrustMetadata(dashboard) : state.trust;
    const nextStateStatus =
      dashboard?.stateStatus ??
      state.stateStatus ??
      session.stateStatus ??
      null;

    state.projectOptions = projects;
    state.projectId = activeProject?.id ?? null;
    state.projectName = activeProject?.name ?? null;
    state.showCue = settings?.settings.showSidepanelOnSupportedSites ?? true;
    state.trust = trust;
    state.stateStatus = nextStateStatus;
    state.remoteStatus = connected ? "ready" : "unavailable";
    state.lastSuccessfulSyncAt = new Date().toISOString();
    state.lastError = null;
    state.retryDelayMs = 0;
    clearRetryTimer(state);

    await setRelaySession({
      connected,
      assumedProjectId: activeProject?.id ?? "",
      assumedProjectName: activeProject?.name ?? "",
      stateStatus: nextStateStatus,
      trust,
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

  state.page = page;
  state.lastObservedSignature = page.captureSignature ?? null;
  state.lastObservedTurns = page.turns ?? 0;

  if (routeChanged) {
    state.lastError = null;
    state.capturePending = false;
    clearCaptureTimer(state);
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
    turns: payload.turns?.length ?? result.capture.turns?.length ?? 0,
    digestQueued: Boolean(payload.digestQueued),
    stateStatus: payload.stateStatus ?? null,
  };
}

async function captureObservedChange(
  tabId: number,
  explicitProjectId?: string,
) {
  const state = getOrCreateTabState(tabId);
  const session = await getRelaySession();
  state.capturePending = true;
  await broadcastActiveProjectState(tabId);

  try {
    if (!session.connected || !session.token || !session.autoCapture) {
      return { ok: false, reason: "Auto-capture is not ready." };
    }

    if (!state.projectId && !explicitProjectId) {
      await syncTabRemoteState(tabId, {
        force: true,
        reason: "capture_needs_project",
      });
    }

    const projectId = explicitProjectId ?? state.projectId;
    if (!projectId) {
      return { ok: false, reason: "Choose a project first." };
    }

    const result = await captureTab(projectId, tabId);
    if (result?.ok) {
      state.lastCapturedSignature =
        state.page.captureSignature ?? state.lastObservedSignature;
      state.lastCapturedTurns = state.page.turns ?? state.lastObservedTurns;
      state.stateStatus = result.stateStatus ?? state.stateStatus;
      invalidateProjectCache(projectId);
      await setRelaySession({
        assumedProjectId: projectId,
        assumedProjectName: state.projectName ?? "",
        resolvedTargetProfileKey: resolveTargetProfile({
          platform: state.page.platform,
          targetMode: session.targetMode,
          manualTargetProfileKey: session.targetProfileKey,
        }),
        stateStatus: result.stateStatus ?? session.stateStatus,
      });
      await syncTabRemoteState(tabId, {
        force: true,
        reason: "capture_complete",
      });
      return {
        ok: true,
        turns: result.turns ?? state.page.turns ?? 0,
        digestQueued: Boolean(result.digestQueued),
        captured: true,
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

  if (
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
        if (message.type === "RELAY_OPEN_CONNECT") {
          const session = await getRelaySession();
          const url = `${session.apiBase}/extension/connect?extensionId=${chrome.runtime.id}&deviceName=${encodeURIComponent(message.payload.deviceName)}`;
          await chrome.tabs.create({ url });
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "RELAY_GOOGLE_SIGN_IN") {
          try {
            // Use promise-based getAuthToken (MV3)
            const authResult = await chrome.identity.getAuthToken({
              interactive: true,
            });
            const accessToken =
              typeof authResult === "string"
                ? authResult
                : authResult?.token;
            if (!accessToken) {
              sendResponse({
                ok: false,
                reason: "Google sign-in was cancelled.",
              });
              return;
            }

            const session = await getRelaySession();
            const apiBase =
              session.apiBase ||
              process.env.PLASMO_PUBLIC_RELAY_API_BASE ||
              "http://localhost:3000";
            const response = await fetch(
              `${apiBase}/api/extension/auth/google`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  googleAccessToken: accessToken,
                  deviceName: message.payload.deviceName,
                }),
              },
            );

            if (!response.ok) {
              const reason = await readErrorResponse(
                response,
                "Google sign-in failed.",
              );
              sendResponse({ ok: false, reason });
              return;
            }

            const payload = (await response.json()) as {
              token: string;
              apiBase: string;
              projectId: string;
              settings?: { settings?: { autoCapture?: boolean } };
            };

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
            });

            sendResponse({ ok: true });
          } catch (cause) {
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
            const response = await relayFetch("/api/projects", {
              method: "POST",
              body: JSON.stringify({ name: message.payload.name }),
            });

            if (!response.ok) {
              const reason = await readErrorResponse(
                response,
                "Project creation failed.",
              );
              sendResponse({ ok: false, reason });
              return;
            }

            const payload = (await response.json()) as {
              project: { id: string; name: string };
            };
            sessionDataCache = null;
            await setRelaySession({
              projectId: payload.project.id,
              assumedProjectId: payload.project.id,
              assumedProjectName: payload.project.name,
            });

            sendResponse({ ok: true, project: payload.project });
          } catch (cause) {
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
          if (state.remoteStatus !== "ready" || !state.projectOptions.length) {
            await syncTabRemoteState(tabId, {
              force: true,
              reason: "active_state_request",
            });
          }

          sendResponse(await buildActiveProjectState(tabId));
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

          await rememberProjectSelection(
            message.payload.projectId,
            tabId,
            pageState,
            state?.projectName,
          );
          if (state) {
            state.projectId = message.payload.projectId;
            state.lastError = null;
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
            await captureObservedChange(tabId, message.payload.projectId),
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
        if (message?.type !== "RELAY_CONNECT_GRANT") {
          sendResponse({ ok: false, reason: "Unsupported external message." });
          return;
        }

        const response = await fetch(
          `${message.payload.apiBase}/api/extension/connect/complete`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              grantToken: message.payload.grantToken,
            }),
          },
        );

        if (!response.ok) {
          sendResponse({
            ok: false,
            reason: await readErrorResponse(
              response,
              "Extension pairing failed.",
            ),
          });
          return;
        }

        const payload = (await response.json()) as {
          token: string;
          apiBase: string;
          projectId: string;
          targetProfileKey: string;
          settings?: { settings?: { autoCapture?: boolean } };
        };

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
          lastStatus: "Extension connected.",
          stateStatus: null,
          assumedProjectId: payload.projectId,
          assumedProjectName: "",
          trust: createEmptyTrustMetadata(),
        });

        sendResponse({ ok: true });
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
