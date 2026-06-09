import type {
  RelayOnboardingState,
  SupportedPlatform,
  UserEntitlementsDto,
} from "@relay/shared";

import type { RelayProjectOption } from "../messaging/contracts";
import {
  clearPersistedBackgroundCache,
  clearPersistedDashboard,
  persistDashboard,
  persistSessionData,
  readPersistedDashboard,
  readPersistedSessionData,
} from "../storage/background-cache";
import {
  clearRelaySession,
  getRelaySession,
  resolveRelayApiBase,
  setRelaySession,
} from "../storage/session";
import { relayFetch } from "../utils/api";
import type {
  ExtensionAuthSessionPayload,
  ProjectDashboardPayload,
  RelayTabState,
  RemoteSettingsPayload,
  RemoteSettingsResponsePayload,
} from "./bg-types";
import {
  createPendingOnboardingState,
  isAuthFailureMessage,
  readErrorResponse,
  retryRemote,
} from "./bg-utils";
import type { AssistantActionResult } from "@relay/shared";

import { buildDashboardContextPreview, buildTrustMetadata } from "./context-preview";
import { applyActionResultToDashboardCache } from "../utils/context-preview-mutations";
import { DASHBOARD_CACHE_TTL_MS, SESSION_CACHE_TTL_MS } from "./remote-sync-policy";
import { authGrace, dashboardCache, dashboardCacheBypass, sessionCache } from "./state";
import { createEmptyTrustMetadata } from "./tab-state";
import { identifyExtensionUser, recordBackgroundTelemetry } from "./telemetry";

export async function resetStoredSession(reason: string) {
  const session = await getRelaySession();
  sessionCache.current = null;
  dashboardCache.clear();
  await clearPersistedBackgroundCache(session.userId || undefined);
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

export async function storeAuthenticatedExtensionSession(
  payload: ExtensionAuthSessionPayload,
  lastStatus: string,
) {
  sessionCache.current = null;
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

export async function loadSessionData(force = false) {
  const session = await getRelaySession();
  if (!session.token) {
    sessionCache.current = null;
    return {
      connected: false,
      projects: [] as RelayProjectOption[],
      settings: null as RemoteSettingsPayload | null,
      onboarding: createPendingOnboardingState(),
      entitlements: null as UserEntitlementsDto | null,
    };
  }

  if (
    !force &&
    sessionCache.current &&
    sessionCache.current.token === session.token &&
    Date.now() - sessionCache.current.fetchedAt < SESSION_CACHE_TTL_MS
  ) {
    return sessionCache.current.data;
  }

  // Durability: after an MV3 worker wake, in-memory cache is gone. Seed it
  // from the persisted snapshot so a recent value can be served immediately
  // (and acts as the failure fallback) while the network refresh runs. A forced
  // refresh skips this early return so a fresh network value is fetched (used
  // after a settings write so per-project overrides reflect immediately).
  if (!sessionCache.current || sessionCache.current.token !== session.token) {
    const persisted = await readPersistedSessionData(session.userId);
    if (persisted) {
      type SessionCacheData = NonNullable<typeof sessionCache.current>["data"];
      sessionCache.current = {
        token: session.token,
        data: persisted.data as unknown as SessionCacheData,
        fetchedAt: persisted.fetchedAt,
      };
      if (!force && Date.now() - persisted.fetchedAt < SESSION_CACHE_TTL_MS) {
        return sessionCache.current.data;
      }
    }
  }

  try {
    const sessionResponse = await retryRemote(() => relayFetch("/api/extension/session"));

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
        if (Date.now() < authGrace.until) {
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
        kind?: "project" | "personal";
        autoCapture?: boolean;
        autoCapturePlatforms?: Partial<Record<SupportedPlatform, boolean>>;
        inlineChip?: boolean;
        inlineChipPlatforms?: Partial<Record<SupportedPlatform, boolean>>;
      }>;
      settings: RemoteSettingsResponsePayload["settings"];
      onboarding?: RelayOnboardingState | null;
      features?: { multiProjectCapture?: boolean } | null;
      entitlements?: UserEntitlementsDto | null;
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
      kind: project.kind ?? "project",
      autoCapture: project.autoCapture,
      autoCapturePlatforms: project.autoCapturePlatforms,
      inlineChip: project.inlineChip,
      inlineChipPlatforms: project.inlineChipPlatforms,
    }));
    // The personal project (kind='personal') rides along for the picker but is
    // never treated as a normal project for auto-selection or the empty-state.
    const selectableProjects = projects.filter((project) => project.kind !== "personal");
    if (selectableProjects.length === 0) {
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
          selectableProjects.some((project) => project.id === session.projectId)
          ? session.projectId
          : onboarding.completedProjectId &&
              selectableProjects.some((project) => project.id === onboarding.completedProjectId)
            ? onboarding.completedProjectId
            : (selectableProjects[0]?.id ?? "")
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
      multiProjectCapture: Boolean(sessionPayload.features?.multiProjectCapture),
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

    const data = {
      connected: true,
      projects,
      settings: settingsPayload.settings,
      onboarding,
      entitlements: sessionPayload.entitlements ?? null,
    };

    const fetchedAt = Date.now();
    sessionCache.current = {
      token: session.token,
      data,
      fetchedAt,
    };
    void persistSessionData(session.userId, data, fetchedAt);

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
    if (sessionCache.current && sessionCache.current.token === session.token) {
      return sessionCache.current.data;
    }

    throw cause;
  }
}

export function invalidateProjectCache(projectId: string | null | undefined) {
  if (!projectId) return;
  // Keep in-memory patches (agent/manual optimistic writes) so a forced refresh
  // after capture/link can merge them instead of restoring stale server rows.
  dashboardCacheBypass.add(projectId);
  void getRelaySession().then((session) => {
    if (session.userId) {
      void clearPersistedDashboard(session.userId, projectId);
    }
  });
}

function emptyDashboard(projectId: string): ProjectDashboardPayload {
  // Minimal shell used when an agent mutation arrives before the dashboard has
  // been fetched. Only project.id and memory are accessed by
  // applyActionResultToDashboardCache; all other fields remain undefined until
  // the real fetch merges over this shell.
  return { project: { id: projectId }, memory: [] } as unknown as ProjectDashboardPayload;
}

export function patchProjectDashboardCache(
  projectId: string,
  result: AssistantActionResult,
  fallbackProjectId?: string | null,
) {
  const cached = dashboardCache.get(projectId);
  const base = cached?.dashboard ?? emptyDashboard(projectId);
  const nextDashboard = applyActionResultToDashboardCache(
    base,
    result,
    fallbackProjectId ?? projectId,
  );
  dashboardCache.set(projectId, { dashboard: nextDashboard, fetchedAt: Date.now() });
  return nextDashboard;
}

function memoryIds(dashboard: ProjectDashboardPayload | null | undefined) {
  return new Set((dashboard?.memory ?? []).map((item) => item.id));
}

function countMemory(dashboard: ProjectDashboardPayload | null | undefined) {
  return dashboard?.memory?.length ?? 0;
}

function mergeDashboardWithCachedPatches(
  cached: ProjectDashboardPayload,
  fetched: ProjectDashboardPayload,
  patchedDuringSync: boolean,
): ProjectDashboardPayload {
  const cachedMemory = cached.memory ?? [];
  const fetchedMemory = fetched.memory ?? [];
  const cachedIds = memoryIds(cached);
  const fetchedIds = memoryIds(fetched);
  const allCachedInFetched = cachedMemory.every((item) => fetchedIds.has(item.id));
  const hasFetchedOnly = fetchedMemory.some((item) => !cachedIds.has(item.id));
  const deletesAheadOfServer =
    patchedDuringSync &&
    cachedMemory.length < fetchedMemory.length &&
    allCachedInFetched &&
    hasFetchedOnly;

  if (deletesAheadOfServer) {
    return {
      ...fetched,
      memory: cachedMemory,
      projectState: cached.projectState ?? fetched.projectState,
    };
  }

  const extras = cachedMemory.filter((item) => !fetchedIds.has(item.id));
  if (extras.length === 0) {
    return fetched;
  }

  return {
    ...fetched,
    memory: [...extras, ...fetchedMemory],
  };
}

/** Prefer a dashboard patched during this sync over a stale network payload. */
export function resolveDashboardForSync(
  projectId: string,
  fetched: ProjectDashboardPayload | null,
  syncStartedAt: number,
): ProjectDashboardPayload | null {
  const cached = dashboardCache.get(projectId);
  if (!fetched) {
    if (cached?.dashboard && cached.fetchedAt >= syncStartedAt) {
      return cached.dashboard;
    }
    return cached?.dashboard ?? null;
  }
  if (!cached?.dashboard) {
    return fetched;
  }

  const patchedDuringSync = cached.fetchedAt >= syncStartedAt;
  const cachedIds = memoryIds(cached.dashboard);
  const fetchedIds = memoryIds(fetched);
  const cachedHasExtras = (cached.dashboard.memory ?? []).some(
    (item) => !fetchedIds.has(item.id),
  );
  const fetchedHasExtras = (fetched.memory ?? []).some((item) => !cachedIds.has(item.id));
  if (
    patchedDuringSync ||
    countMemory(cached.dashboard) !== countMemory(fetched) ||
    cachedHasExtras ||
    fetchedHasExtras
  ) {
    return mergeDashboardWithCachedPatches(
      cached.dashboard,
      fetched,
      patchedDuringSync,
    );
  }
  return fetched;
}

/** Cache-first preview hydrate (stale-while-revalidate) for project switches. */
export async function hydrateTabStateDashboardPreview(
  state: RelayTabState,
  projectId: string,
): Promise<boolean> {
  const dashboard = await fetchProjectDashboard(projectId);
  if (!dashboard) return false;
  state.contextPreview = buildDashboardContextPreview(dashboard);
  state.trust = buildTrustMetadata(dashboard);
  state.stateStatus = dashboard.stateStatus ?? state.stateStatus;
  if (state.remoteStatus === "unavailable") {
    state.remoteStatus = "stale";
  }
  return true;
}

export async function refreshProjectDashboard(
  projectId: string,
  userId: string,
): Promise<ProjectDashboardPayload | null> {
  try {
    const response = await retryRemote(() =>
      relayFetch(`/api/projects/${projectId}`),
    );
    if (!response.ok) {
      return dashboardCache.get(projectId)?.dashboard ?? null;
    }

    const payload = (await response.json()) as {
      dashboard?: ProjectDashboardPayload;
    };
    const fetched = payload.dashboard ?? null;
    if (!fetched) {
      return dashboardCache.get(projectId)?.dashboard ?? null;
    }
    const previous = dashboardCache.get(projectId);
    const dashboard = previous?.dashboard
      ? mergeDashboardWithCachedPatches(previous.dashboard, fetched, false)
      : fetched;
    const fetchedAt = Date.now();
    dashboardCache.set(projectId, { dashboard, fetchedAt });
    if (userId) void persistDashboard(userId, projectId, dashboard, fetchedAt);
    return dashboard;
  } catch {
    return dashboardCache.get(projectId)?.dashboard ?? null;
  }
}

export async function fetchProjectDashboard(projectId: string) {
  if (dashboardCacheBypass.has(projectId)) {
    dashboardCacheBypass.delete(projectId);
    const { userId } = await getRelaySession();
    return refreshProjectDashboard(projectId, userId);
  }

  const cached = dashboardCache.get(projectId);
  if (cached && Date.now() - cached.fetchedAt < DASHBOARD_CACHE_TTL_MS) {
    return cached.dashboard;
  }

  const { userId } = await getRelaySession();

  // Durability + stale-while-revalidate: after an MV3 worker wake the memory
  // cache is empty. Serve a recent persisted value immediately; if it is
  // older than the in-memory TTL, still serve it but revalidate in the
  // background so the next read is fresh.
  if (!cached && userId) {
    const persisted = await readPersistedDashboard<
      ProjectDashboardPayload | null
    >(userId, projectId);
    if (persisted) {
      dashboardCache.set(projectId, {
        dashboard: persisted.data,
        fetchedAt: persisted.fetchedAt,
      });
      if (Date.now() - persisted.fetchedAt < DASHBOARD_CACHE_TTL_MS) {
        return persisted.data;
      }
      void refreshProjectDashboard(projectId, userId);
      return persisted.data;
    }
  }

  return refreshProjectDashboard(projectId, userId);
}
