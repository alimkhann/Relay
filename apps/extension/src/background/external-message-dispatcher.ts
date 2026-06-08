import type { RelayMessage } from "../messaging/contracts";
import { setRelaySession } from "../storage/session";
import { setRelayThemeMode } from "../storage/theme";
import {
  broadcastThemeChange,
  broadcastUserSettingsChange,
} from "./active-project";
import type { RemoteSettingsPayload } from "./bg-types";
import { loadSessionData } from "./session-cache";
import { dashboardCache, sessionCache, tabStates } from "./state";

export function createExternalMessageDispatcher(deps: {
  syncTabRemoteState(
    tabId: number,
    options?: { force?: boolean; reason?: string },
  ): Promise<void>;
}) {
  async function dispatchExternalMessage(
    message: any,
    sendResponse: (response?: unknown) => void,
  ) {
    try {
      if (message?.type === "billing.refresh" || message?.type === "RELAY_BILLING_REFRESH") {
        sessionCache.current = null;
        dashboardCache.clear();
        try {
          await loadSessionData();
        } catch {
          // Next natural refresh will pick up billing/session state.
        }
        void chrome.runtime
          .sendMessage({ type: "RELAY_EXTENSION_BILLING_CHANGED" } satisfies RelayMessage)
          .catch(() => undefined);
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
        for (const [tabId, state] of tabStates.entries()) {
          if (!state.page.supported) continue;
          void deps.syncTabRemoteState(tabId, {
            force: true,
            reason: "settings_push",
          });
        }
        sendResponse({ ok: true });
        return;
      }

      sendResponse({
        ok: false,
        reason:
          message?.type === "RELAY_CONNECT_GRANT"
            ? "Extension web pairing has been removed. Use Google sign-in from the extension."
            : "Unsupported external message.",
      });
    } catch (cause) {
      sendResponse({
        ok: false,
        reason: cause instanceof Error ? cause.message : "Extension pairing failed.",
      });
    }
  }

  return { dispatchExternalMessage };
}
