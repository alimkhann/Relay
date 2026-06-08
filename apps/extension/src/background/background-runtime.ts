import {
  effectiveAutoCapture,
  effectiveInlineChip,
} from "@relay/shared/utils/capture-settings";
import { createFlowId } from "@relay/shared/utils/telemetry";
import { slugify } from "@relay/shared/utils/text";
import type {
  ProjectDashboardDto,
  ProjectStateStatusDto,
  RelayOnboardingState,
  SupportedPlatform,
  UserEntitlementsDto,
} from "@relay/shared";

import type {
  RelayActiveProjectState,
  RelayAssociationToastPayload,
  RelayAssociationToastState,
  RelayChatAssociation,
  RelayInsertState,
  RelayMessage,
  RelayPageState,
  RelayProjectOption,
  RelayRemoteStatus,
  RelayRoutingReview,
} from "../messaging/contracts";
import {
  clearIgnoredChatKey,
  clearManualOverride,
  isIgnoredChatKey,
  readAssociationAdjudication,
  readApprovedAssociations,
  rememberAssociationAdjudication,
  rememberApprovedAssociation,
  rememberIgnoredChatKey,
  rememberManualOverride,
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
  hasPersonalProfileIntent,
  pickPreferredProjectId,
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
  looksLikeFreshChatRoute,
  shouldScheduleAutoCapture,
  shouldScheduleAutoCaptureRouting,
  shouldScheduleIncrementalCapture,
} from "./tab-state";
import {
  shouldSyncMissingRemoteState,
  TAB_REMOTE_SYNC_FRESH_MS,
} from "./remote-sync-policy";
import { RETRY_DRAIN_DELAY_MS, scheduleDrain } from "./drain-scheduler";
import { requestGoogleIdentityTokens } from "./oauth";
import {
  broadcastActiveProjectState,
  broadcastThemeChange,
  broadcastUserSettingsChange,
  buildActiveProjectState,
} from "./active-project";
import {
  buildSavedChatAssociation,
  getRetargetableAssociationProject,
  hydrateTabStateFromSession,
  reconcileManualOverride,
  resolveAssociationProjectOption,
  setEffectiveProjectTarget,
  setSessionProjectTarget,
  updateAssociationProjectState,
} from "./association";
import { authGrace, dashboardCache, sessionCache, tabStates } from "./state";
import { buildDashboardContextPreview, buildTrustMetadata } from "./context-preview";
import {
  fetchProjectDashboard,
  invalidateProjectCache,
  loadSessionData,
  refreshProjectDashboard,
  resetStoredSession,
  storeAuthenticatedExtensionSession,
} from "./session-cache";
import type {
  ExtensionAuthSessionPayload,
  ProjectDashboardPayload,
  RelayTabState,
  RemoteSettingsPayload,
  RemoteSettingsResponsePayload,
} from "./bg-types";
import {
  AUTO_CAPTURE_GRACE_MS,
  CAPTURE_API_TIMEOUT_MS,
  CAPTURE_TAB_MESSAGE_TIMEOUT_MS,
  createPendingOnboardingState,
  readErrorResponse,
  REMOTE_RETRY_BACKOFF_MS,
  retryRemote,
  sendTabMessageWithTimeout,
  wait,
} from "./bg-utils";
import {
  flushBackgroundTelemetry,
  identifyExtensionUser,
  initializeBackgroundTelemetry,
  recordBackgroundTelemetry,
} from "./telemetry";
import { filterInsertedContextCapture } from "./inserted-context-capture";
import { persistTabSignature } from "../storage/capture-signatures";
import {
  buildPendingInsertedBriefState,
  capturedTurnsMatchPendingInsertedBrief,
  clearAssociationToast,
  clearAssociationToastTimer,
  clearCaptureTimer,
  clearInsertStateTimer,
  clearPendingAssociation,
  clearPendingInsertedBrief,
  clearRetryTimer,
  clearTabState,
  getOrCreateTabState,
  matchesPendingInsertedBrief,
  rehydrateTabSignatures,
  setInsertState,
  updateTabPageState,
} from "./tab-state-store";
import { createPageController } from "./page-controller";
import { captureTab } from "./capture-api";
import { createSelectionSaveController } from "./selection-save-controller";
import { createInsertionController } from "./insertion-controller";
import { createSyncController } from "./sync-controller";
import {
  captureObservedChange,
  configureCaptureController,
} from "./capture-controller";
import {
  configureCaptureScheduler,
  scheduleAutoCapture,
  scheduleInsertStateReset,
} from "./capture-scheduler";
import {
  archiveChatAssociation,
  configureAssociationController,
  dismissCaptureReview,
  logRoutingDecision,
  logAutoCaptureGate,
  resolveAssociationToast,
  resolveAutoCaptureRouting,
  restoreApprovedAssociationState,
  retargetAssociation,
  showAskToast,
  showAssociationToast,
  showSavingToast,
} from "./association-controller";

void rehydrateTabSignatures();

initializeBackgroundTelemetry();

const {
  rememberProjectSelection,
  syncTabRemoteState,
} = createSyncController({
  broadcastActiveProjectState,
  scheduleAutoCapture,
});
const {
  requestPageStateFromTab,
  refreshPageStateAndSyncIfMissing,
} = createPageController({ syncTabRemoteState });
const { handleSaveSelectionToRelay, showFailureToastInTab } =
  createSelectionSaveController({
    rememberProjectSelection,
    syncTabRemoteState,
  });
const { insertProjectBrief } = createInsertionController({
  requestPageStateFromTab,
  syncTabRemoteState,
  rememberProjectSelection,
  broadcastActiveProjectState,
  scheduleInsertStateReset,
});
configureAssociationController({
  broadcastActiveProjectState,
  captureObservedChange,
  syncTabRemoteState,
});
configureCaptureController({
  broadcastActiveProjectState,
  rememberProjectSelection,
  requestPageStateFromTab,
  syncTabRemoteState,
});
configureCaptureScheduler({
  broadcastActiveProjectState,
  captureObservedChange,
});

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

  chrome.runtime.setUninstallURL("https://onrelay.app/goodbye").catch(() => undefined);

  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") }).catch(() => undefined);
  }

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
      void refreshPageStateAndSyncIfMissing(tabId, "tab_complete");
    }
  },
);

chrome.runtime.onSuspend.addListener(() => {
  void flushBackgroundTelemetry();
});

chrome.tabs.onActivated.addListener((activeInfo: { tabId: number }) => {
  void refreshPageStateAndSyncIfMissing(activeInfo.tabId, "tab_focus");
  const state = tabStates.get(activeInfo.tabId);

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
  if (command === "open-sidebar") {
    void (async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const windowId = tabs[0]?.windowId;
      if (windowId) chrome.sidePanel.open({ windowId }).catch(() => undefined);
    })();
    return;
  }

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
            authGrace.until = Date.now() + 5_000;
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
            authGrace.until = Date.now() + 5_000;
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
            authGrace.until = Date.now() + 5_000;
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
            sessionCache.current = null;
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
            sessionCache.current = null;
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
            sessionCache.current = null;
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
          const force = message.payload?.force === true;
          sessionCache.current = null;
          const payload = await loadSessionData(force);
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
          const state = getOrCreateTabState(sender.tab.id);
          if (
            shouldSyncMissingRemoteState({
              pageSupported: state.page.supported,
              remoteStatus: state.remoteStatus,
              lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
            })
          ) {
            void syncTabRemoteState(sender.tab.id, {
              reason: "page_state_update",
            });
          }
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

          if (
            shouldSyncMissingRemoteState({
              pageSupported: state.page.supported,
              remoteStatus: state.remoteStatus,
              lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
            })
          ) {
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
                overrideDisplacedAssociation,
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
          sessionCache.current = null;
          dashboardCache.clear();
          try {
            await loadSessionData();
          } catch {
            // Ignored — next natural refresh will pick up the state.
          }
          const billingChangedMessage: RelayMessage = {
            type: "RELAY_EXTENSION_BILLING_CHANGED",
          };
          void chrome.runtime.sendMessage(billingChangedMessage).catch(() => undefined);
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

          sessionCache.current = null;
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
