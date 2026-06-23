import { effectiveInlineChip } from "@relay/shared/utils/capture-settings";
import type { SupportedPlatform } from "@relay/shared";

import type { RelayPageState } from "../messaging/contracts";
import { readApprovedAssociations } from "../storage/routing";
import { getRelaySession, setRelaySession } from "../storage/session";
import {
  readDormancySnapshot,
  shouldSkipRemoteSyncForDormancy,
  type RelayActivitySource,
} from "../storage/dormancy";
import { relayFetch } from "../utils/api";
import { buildSavedAssociationFromMemory } from "./association-workflow";
import { buildSavedChatAssociation, getRetargetableAssociationProject, hydrateTabStateFromSession, reconcileManualOverride } from "./association";
import { REMOTE_RETRY_BACKOFF_MS, retryRemote } from "./bg-utils";
import { buildDashboardContextPreview, buildTrustMetadata } from "./context-preview";
import { preferContextPreviewOnSync } from "../utils/context-preview";
import {
  shouldSyncMissingRemoteState,
  shouldSyncProjectDashboardOnly,
  TAB_REMOTE_SYNC_FRESH_MS,
} from "./remote-sync-policy";
import { pickPreferredProjectId, findApprovedAssociationMatch } from "./routing";
import {
  fetchProjectDashboard,
  loadSessionData,
  resolveDashboardForSync,
} from "./session-cache";
import { createEmptyChatAssociation } from "./tab-state";
import { clearRetryTimer, getOrCreateTabState } from "./tab-state-store";

export function createSyncController(deps: {
  broadcastActiveProjectState(tabId: number): Promise<void>;
  scheduleAutoCapture(tabId: number, options?: { immediate?: boolean }): Promise<void>;
}) {
  type SyncOptions = { force?: boolean; reason?: string; source?: RelayActivitySource };

  async function resolveBoundProject(tabId: number, pageState: RelayPageState) {
    if (!pageState.supported) return null;
    const query = new URLSearchParams();
    if (pageState.domain) query.set("domain", pageState.domain);
    if (pageState.platform) query.set("platform", pageState.platform);
    query.set("tabId", String(tabId));
    const response = await retryRemote(() =>
      relayFetch(`/api/extension/bindings?${query.toString()}`),
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      binding?: {
        binding: { bindingKind: "tab" | "domain" | "manual" };
        project: { id: string; name: string; slug?: string | null };
      } | null;
    };
    return payload.binding ?? null;
  }

  async function resolveActiveProject(
    tabId: number,
    pageState: RelayPageState,
    preferred?:
      | string
      | null
      | {
          manualProjectId?: string | null;
          associationProjectId?: string | null;
          rememberedProjectId?: string | null;
        },
  ) {
    const session = await getRelaySession();
    const remote = await loadSessionData();
    const bound = remote.connected ? await resolveBoundProject(tabId, pageState) : null;
    const preferredProjectId =
      typeof preferred === "object" && preferred !== null
        ? pickPreferredProjectId({
            manualProjectId: preferred.manualProjectId,
            associationProjectId: preferred.associationProjectId,
            rememberedProjectId: preferred.rememberedProjectId,
            projectIds: remote.projects.map((project) => project.id),
          })
        : (preferred ?? null);
    const preferredProject = preferredProjectId
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
        ? { projectId: bound.project.id, bindingKind: bound.binding.bindingKind }
        : null,
    };
  }

  async function rememberProjectSelection(
    projectId: string,
    tabId: number | null,
    pageState: RelayPageState,
    projectName?: string | null,
  ) {
    const session = await getRelaySession();
    const selectedProject =
      session.projectOptions.find((project) => project.id === projectId) ?? null;
    if (selectedProject?.kind === "personal") {
      await setRelaySession({
        projectId,
        assumedProjectId: projectId,
        assumedProjectName: projectName ?? selectedProject.name,
      });
      return;
    }
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
      updates.push(relayFetch("/api/extension/bindings", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          bindingKind: "tab",
          tabId: String(tabId),
          platform: pageState.platform ?? null,
        }),
      }));
    }
    if (pageState.domain) {
      updates.push(relayFetch("/api/extension/bindings", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          bindingKind: "domain",
          domain: pageState.domain,
          platform: pageState.platform ?? null,
        }),
      }));
    }
    const results = await Promise.allSettled(updates);
    const bindingFailed = results.some(
      (result) =>
        result.status === "rejected" ||
        (result.status === "fulfilled" && !result.value.ok),
    );
    if (bindingFailed) {
      throw new Error("Failed to persist project bindings.");
    }
    await setRelaySession({
      projectId,
      assumedProjectId: projectId,
      assumedProjectName: projectName ?? "",
    });
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

  async function syncProjectDashboardOnly(
    tabId: number,
    options: SyncOptions = {},
  ) {
    const state = getOrCreateTabState(tabId);
    const reason = options.reason ?? "";
    const dormancy = await readDormancySnapshot();
    if (
      shouldSkipRemoteSyncForDormancy({
        dormant: dormancy.dormant,
        reason,
        source: options.source,
      })
    ) {
      return;
    }
    const session = await getRelaySession();
    hydrateTabStateFromSession(state, session);

    if (!session.token) {
      state.remoteStatus = "unavailable";
      state.lastError = null;
      await deps.broadcastActiveProjectState(tabId);
      return;
    }

    const projectId =
      state.manualProjectId ??
      session.assumedProjectId ??
      session.projectId ??
      null;
    if (!projectId) {
      state.remoteStatus = "unavailable";
      state.lastError = null;
      await deps.broadcastActiveProjectState(tabId);
      return;
    }

    const requestKey = `project-only|${projectId}`;
    const projectChanged = Boolean(
      state.lastSyncedProjectId && projectId !== state.lastSyncedProjectId,
    );
    const forceRefresh =
      Boolean(options.force) ||
      reason === "active_state_request" ||
      reason === "project_dashboard_request" ||
      reason === "project_switch" ||
      reason === "cache_invalidated" ||
      projectChanged;
    const shouldSkip =
      !forceRefresh &&
      state.remoteStatus === "ready" &&
      state.lastSuccessfulSyncAt &&
      state.lastSyncedRequestKey === requestKey &&
      Date.now() - new Date(state.lastSuccessfulSyncAt).getTime() < TAB_REMOTE_SYNC_FRESH_MS;
    if (shouldSkip) return;

    if (state.syncInFlight) {
      state.syncQueued = true;
      if (reason === "project_switch" || reason === "cache_invalidated") {
        state.pendingSyncReason = reason;
      }
      return;
    }

    state.syncInFlight = true;
    state.syncQueued = false;
    state.syncRequestKey = requestKey;
    state.remoteStatus =
      state.lastSuccessfulSyncAt || session.projectOptions.length > 0 || session.assumedProjectId
        ? "stale"
        : "loading";
    await deps.broadcastActiveProjectState(tabId);

    try {
      const syncStartedAt = Date.now();
      const remote = await loadSessionData();
      const activeProject = remote.projects.find((project) => project.id === projectId) ?? null;
      const fetchedDashboard = await fetchProjectDashboard(projectId);
      const dashboard = resolveDashboardForSync(projectId, fetchedDashboard, syncStartedAt);

      const currentSession = await getRelaySession();
      const currentProjectId =
        state.manualProjectId ??
        currentSession.assumedProjectId ??
        currentSession.projectId ??
        null;
      if (currentProjectId !== projectId) {
        state.syncQueued = true;
        state.pendingSyncReason = "project_switch";
        return;
      }

      state.projectOptions = remote.projects;
      state.projectId = activeProject?.id ?? projectId;
      state.projectName = activeProject?.name ?? session.assumedProjectName ?? state.projectName;
      state.trust = dashboard ? buildTrustMetadata(dashboard) : state.trust;
      state.stateStatus = dashboard?.stateStatus ?? state.stateStatus ?? session.stateStatus ?? null;
      state.contextPreview = preferContextPreviewOnSync(
        state.contextPreview,
        buildDashboardContextPreview(dashboard),
      );
      state.remoteStatus = remote.connected ? "ready" : "unavailable";
      state.lastSuccessfulSyncAt = new Date().toISOString();
      state.lastSyncedRequestKey = requestKey;
      state.lastSyncedProjectId = projectId;
      state.lastError = null;
      state.retryDelayMs = 0;
      clearRetryTimer(state);
      await setRelaySession({
        connected: remote.connected,
        projectId: remote.onboarding.status === "completed" ? state.projectId ?? "" : "",
        assumedProjectId: state.projectId ?? "",
        assumedProjectName: state.projectName ?? "",
        stateStatus: state.stateStatus,
        trust: state.trust,
        projectOptions: remote.projects,
        onboarding: remote.onboarding,
      });
    } catch (cause) {
      state.lastError = cause instanceof Error ? cause.message : "Failed to fetch";
      state.remoteStatus = state.lastSuccessfulSyncAt ? "stale" : "unavailable";
      scheduleRetry(tabId);
    } finally {
      state.syncInFlight = false;
      state.syncRequestKey = null;
      await deps.broadcastActiveProjectState(tabId);
      if (state.syncQueued) {
        state.syncQueued = false;
        const queuedReason = state.pendingSyncReason ?? "queued_refresh";
        state.pendingSyncReason = null;
        void syncProjectDashboardOnly(tabId, { force: true, reason: queuedReason });
      }
    }
  }

  async function syncTabRemoteState(
    tabId: number,
    options: SyncOptions = {},
  ) {
    const state = getOrCreateTabState(tabId);
    const reason = options.reason ?? "";
    const dormancy = await readDormancySnapshot();
    if (
      shouldSkipRemoteSyncForDormancy({
        dormant: dormancy.dormant,
        reason,
        source: options.source,
      })
    ) {
      return;
    }
    if (!state.page.supported) {
      await syncProjectDashboardOnly(tabId, options);
      return;
    }
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
      await deps.broadcastActiveProjectState(tabId);
      return;
    }
    if (state.syncInFlight) {
      state.syncQueued = true;
      if (reason === "project_switch" || reason === "cache_invalidated") {
        state.pendingSyncReason = reason;
      }
      return;
    }
    const selectedProjectId =
      state.manualProjectId ?? session.assumedProjectId ?? session.projectId ?? null;
    const projectChanged = Boolean(
      selectedProjectId &&
        state.lastSyncedProjectId &&
        selectedProjectId !== state.lastSyncedProjectId,
    );
    const forceBypassesFreshness =
      (Boolean(options.force) &&
        reason !== "tab_complete" &&
        reason !== "tab_focus") ||
      reason === "project_switch" ||
      reason === "cache_invalidated" ||
      projectChanged;
    const shouldSkip =
      !forceBypassesFreshness &&
      state.remoteStatus === "ready" &&
      state.lastSuccessfulSyncAt &&
      state.lastSyncedRequestKey === requestKey &&
      Date.now() - new Date(state.lastSuccessfulSyncAt).getTime() <
        TAB_REMOTE_SYNC_FRESH_MS;
    if (shouldSkip) return;

    state.syncInFlight = true;
    state.syncQueued = false;
    state.syncRequestKey = requestKey;
    state.remoteStatus =
      state.lastSuccessfulSyncAt || session.projectOptions.length > 0 || session.assumedProjectId
        ? "stale"
        : "loading";
    await deps.broadcastActiveProjectState(tabId);
    try {
      const syncStartedAt = Date.now();
      await reconcileManualOverride(state);
      const approvedAssociations = await readApprovedAssociations();
      const rememberedAssociation = findApprovedAssociationMatch(state.page, approvedAssociations);
      const { connected, projects, activeProject, settings, boundProject, onboarding } =
        await resolveActiveProject(tabId, state.page, {
          manualProjectId: state.manualProjectId,
          associationProjectId: getRetargetableAssociationProject(state)?.projectId ?? null,
          rememberedProjectId: rememberedAssociation?.projectId ?? null,
        });
      const fetchedDashboard = activeProject
        ? await fetchProjectDashboard(activeProject.id)
        : null;
      const dashboard = activeProject
        ? resolveDashboardForSync(activeProject.id, fetchedDashboard, syncStartedAt)
        : null;

      const expectedProjectId =
        state.manualProjectId ?? session.assumedProjectId ?? session.projectId ?? null;
      if (
        expectedProjectId &&
        activeProject?.id &&
        expectedProjectId !== activeProject.id
      ) {
        state.syncQueued = true;
        state.pendingSyncReason = "project_switch";
        return;
      }

      const nextStateStatus =
        dashboard?.stateStatus ?? state.stateStatus ?? session.stateStatus ?? null;
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
      const activeOption = activeProject
        ? projects.find((option) => option.id === activeProject.id)
        : undefined;
      state.showCue = effectiveInlineChip({
        platform: (state.page.platform ?? null) as SupportedPlatform | null,
        global: settings?.settings.showSidepanelOnSupportedSites ?? true,
        project: activeOption?.inlineChip,
        projectPlatforms: activeOption?.inlineChipPlatforms,
      });
      state.trust = dashboard ? buildTrustMetadata(dashboard) : state.trust;
      state.stateStatus = nextStateStatus;
      state.contextPreview = preferContextPreviewOnSync(
        state.contextPreview,
        buildDashboardContextPreview(dashboard),
      );
      // Don't overwrite a user-intentional state (archived/ignored) with stale
      // server data — the dashboard cache may not yet reflect the change.
      if (nextChatAssociation.status !== "none" && !state.associationSuppressed) {
        state.chatAssociation = nextChatAssociation;
      } else if (!state.associationSuppressed && !["held", "ignored", "pending", "archived", "saved"].includes(state.chatAssociation.status)) {
        state.chatAssociation = createEmptyChatAssociation();
      }
      state.remoteStatus = connected ? "ready" : "unavailable";
      state.lastSuccessfulSyncAt = new Date().toISOString();
      state.lastSyncedRequestKey = requestKey;
      state.lastSyncedProjectId = activeProject?.id ?? null;
      state.lastError = null;
      state.retryDelayMs = 0;
      clearRetryTimer(state);
      await setRelaySession({
        connected,
        projectId: onboarding.status === "completed" ? activeProject?.id ?? "" : "",
        assumedProjectId: activeProject?.id ?? "",
        assumedProjectName: activeProject?.name ?? "",
        stateStatus: nextStateStatus,
        trust: state.trust,
        projectOptions: projects,
        onboarding,
      });
      await deps.scheduleAutoCapture(tabId, { immediate: true });
    } catch (cause) {
      state.lastError = cause instanceof Error ? cause.message : "Failed to fetch";
      state.remoteStatus = state.lastSuccessfulSyncAt ? "stale" : "unavailable";
      scheduleRetry(tabId);
    } finally {
      state.syncInFlight = false;
      state.syncRequestKey = null;
      await deps.broadcastActiveProjectState(tabId);
      if (state.syncQueued) {
        state.syncQueued = false;
        const queuedReason = state.pendingSyncReason ?? "queued_refresh";
        state.pendingSyncReason = null;
        void syncTabRemoteState(tabId, { force: true, reason: queuedReason });
      }
    }
  }

  return {
    rememberProjectSelection,
    resolveActiveProject,
    resolveBoundProject,
    scheduleRetry,
    syncProjectDashboardOnly,
    syncTabRemoteState,
    shouldSyncMissingRemoteState,
    shouldSyncProjectDashboardOnly,
  };
}
