import { actionResultToMemoryMutations } from "@relay/shared/utils/memory-mutations";

import type { RelayActiveProjectState, RelayMessage, RelayPageState } from "../messaging/contracts";
import { applyMemoryMutationToContextPreview } from "../utils/context-preview-mutations";
import { rememberManualOverride } from "../storage/routing";
import { clearRelaySession, getRelaySession, resolveRelayApiBase, setRelaySession } from "../storage/session";
import { relayFetch } from "../utils/api";
import { buildActiveProjectState } from "./active-project";
import { getRetargetableAssociationProject, hydrateTabStateFromSession } from "./association";
import { createEmptyActiveProjectState } from "./tab-state";
import { buildAssociationKey } from "./routing";
import { sessionCache, tabStates } from "./state";
import {
  shouldSyncMissingRemoteState,
  shouldSyncProjectDashboardOnly,
} from "./remote-sync-policy";
import {
  hydrateTabStateDashboardPreview,
  invalidateProjectCache,
  loadSessionData,
  patchProjectDashboardCache,
} from "./session-cache";
import { readErrorResponse } from "./bg-utils";
import { recordBackgroundTelemetry } from "./telemetry";
import { getOrCreateTabState, updateTabPageState, clearAssociationToast } from "./tab-state-store";
import type { SaveSelectionParams, SaveSelectionResult } from "./selection-save-controller";
import { handleAuthMessage } from "./auth-message-handlers";
import { handleProjectMessage } from "./project-message-handlers";

export function registerInternalMessageListener(deps: {
  archiveChatAssociation(tabId: number, projectId: string, sessionId: string, archived: boolean): Promise<void>;
  broadcastActiveProjectState(tabId: number): Promise<void>;
  captureObservedChange(tabId: number, projectId?: string, options?: any): Promise<any>;
  dismissCaptureReview(tabId: number): Promise<void>;
  handleSaveSelectionToRelay(params: SaveSelectionParams): Promise<SaveSelectionResult>;
  insertProjectBrief(tabId: number, projectId?: string, source?: "sidebar" | "inline_chip" | "shortcut" | null): Promise<unknown>;
  rememberProjectSelection(projectId: string, tabId: number | null, pageState: RelayPageState, projectName?: string | null): Promise<void>;
  requestPageStateFromTab(tabId: number): Promise<RelayPageState>;
  resolveAssociationToast(tabId: number, payload: { action: "approve" | "cancel"; mode: "saving" | "ask"; projectId: string }): Promise<unknown>;
  retargetAssociation(tabId: number, projectId: string, source?: "toast" | "inline_chip" | "sidebar"): Promise<unknown>;
  scheduleAutoCapture(tabId: number, options?: { immediate?: boolean }): Promise<void>;
  syncTabRemoteState(tabId: number, options?: { force?: boolean; reason?: string }): Promise<void>;
}) {
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

        if (await handleAuthMessage(message, sendResponse)) {
          return;
        }

        if (await handleProjectMessage(message, sendResponse)) {
          return;
        }

        if (message.type === "RELAY_LOG_TELEMETRY") {
          recordBackgroundTelemetry(message.payload);
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "RELAY_REFRESH_SESSION") {
          const force = message.payload?.force === true;
          sessionCache.current = null;
          const payload = await loadSessionData(force);
          sendResponse({ ok: true, ...payload });
          return;
        }

        if (message.type === "RELAY_INVALIDATE_PROJECT_CACHE") {
          invalidateProjectCache(message.payload?.projectId);
          const shouldSync = message.payload?.sync !== false;
          const invalidateTabId = sender.tab?.id;
          if (shouldSync && invalidateTabId) {
            void deps.syncTabRemoteState(invalidateTabId, {
              force: true,
              reason: "cache_invalidated",
            });
          }
          sendResponse({ ok: true });
          return;
        }

        if (message.type === "RELAY_APPLY_AGENT_MEMORY_MUTATION") {
          const tabId = message.payload.tabId ?? sender.tab?.id ?? null;
          const result = message.payload.result;
          const projectId =
            message.payload.projectId ??
            result.items[0]?.projectId ??
            result.previews?.[0]?.after?.projectId ??
            result.previews?.[0]?.before?.projectId ??
            null;
          if (tabId) {
            const state = getOrCreateTabState(tabId);
            const effectiveProjectId =
              projectId ??
              state.manualProjectId ??
              state.projectId ??
              null;
            if (effectiveProjectId) {
              patchProjectDashboardCache(effectiveProjectId, result, effectiveProjectId);
              const mutations = actionResultToMemoryMutations(result, effectiveProjectId);
              let preview = state.contextPreview;
              for (const mutation of mutations) {
                if (
                  mutation.sourceProjectId === effectiveProjectId ||
                  mutation.targetProjectId === effectiveProjectId
                ) {
                  preview = applyMemoryMutationToContextPreview(preview, mutation);
                }
              }
              state.contextPreview = preview;
              void deps.broadcastActiveProjectState(tabId);
            }
          } else if (projectId) {
            patchProjectDashboardCache(projectId, result, projectId);
          }
          sendResponse({ ok: true });
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
          await deps.broadcastActiveProjectState(sender.tab.id);
          const state = getOrCreateTabState(sender.tab.id);
          if (
            shouldSyncMissingRemoteState({
              pageSupported: state.page.supported,
              remoteStatus: state.remoteStatus,
              lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
            })
          ) {
            void deps.syncTabRemoteState(sender.tab.id, {
              reason: "page_state_update",
            });
          }
          void deps.scheduleAutoCapture(sender.tab.id);
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
            await deps.requestPageStateFromTab(tabId);
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

          if (
            shouldSyncMissingRemoteState({
              pageSupported: state.page.supported,
              remoteStatus: state.remoteStatus,
              lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
            })
          ) {
            void deps.syncTabRemoteState(tabId, {
              force: true,
              reason: "active_state_request",
            });
          } else if (
            shouldSyncProjectDashboardOnly({
              pageSupported: state.page.supported,
              connected: session.connected,
              hasProjectId: Boolean(
                state.manualProjectId || session.assumedProjectId || session.projectId,
              ),
              remoteStatus: state.remoteStatus,
              lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
              projectId:
                state.manualProjectId ?? session.assumedProjectId ?? session.projectId ?? null,
              lastSyncedProjectId: state.lastSyncedProjectId,
            })
          ) {
            void deps.syncTabRemoteState(tabId, {
              force: true,
              reason: "project_dashboard_request",
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
              ? await deps.requestPageStateFromTab(tabId)
              : ({ supported: false } satisfies RelayPageState);
          const nextProjectName =
            state?.projectOptions.find(
              (project) => project.id === message.payload.projectId,
            )?.name ?? state?.projectName;

          await deps.rememberProjectSelection(
            message.payload.projectId,
            tabId,
            pageState,
            nextProjectName,
          );
          // On a supported chat, a manual pick must win over the chat's
          // auto-derived association — for the active project, the picker, and
          // the next save — and survive re-syncs of this same chat. Persist it
          // per chat key so a service-worker restart keeps the choice.
          let overrideDisplacedAssociation = false;
          if (state && pageState.supported) {
            const overrideChatKey = buildAssociationKey(pageState);
            const priorAssociationProjectId =
              getRetargetableAssociationProject(state)?.projectId ?? null;
            overrideDisplacedAssociation =
              priorAssociationProjectId != null &&
              priorAssociationProjectId !== message.payload.projectId;
            state.manualProjectId = message.payload.projectId;
            state.manualProjectChatKey = overrideChatKey;
            await rememberManualOverride(overrideChatKey, message.payload.projectId);
          }
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

          if (tabId !== null && state) {
            state.remoteStatus =
              state.lastSuccessfulSyncAt || state.projectOptions.length > 0
                ? "stale"
                : "loading";
            await hydrateTabStateDashboardPreview(state, message.payload.projectId);
            await deps.broadcastActiveProjectState(tabId);
            await deps.syncTabRemoteState(tabId, {
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
                overrideDisplacedAssociation,
              },
            });
            sendResponse(await buildActiveProjectState(tabId));
            return;
          }

          sendResponse({ ok: true });
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
            await deps.retargetAssociation(
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

          await deps.dismissCaptureReview(tabId);
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

          await deps.archiveChatAssociation(
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
            await deps.resolveAssociationToast(tabId, {
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
            await deps.insertProjectBrief(
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
            await deps.syncTabRemoteState(tabId, {
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

          const result = await deps.handleSaveSelectionToRelay({
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
            await deps.captureObservedChange(tabId, message.payload.projectId, {
              manualSelection: Boolean(message.payload.projectId),
              skipAssociationToast: false,
              additionalProjectIds: message.payload.additionalProjectIds,
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

          sendResponse(await deps.captureObservedChange(tabId));
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


}
