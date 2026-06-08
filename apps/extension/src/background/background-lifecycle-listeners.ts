import { flushBackgroundTelemetry, recordBackgroundTelemetry } from "./telemetry";
import { tabStates } from "./state";
import type { SaveSelectionParams, SaveSelectionResult } from "./selection-save-controller";

export function registerBackgroundLifecycleListeners(deps: {
  clearTabState(tabId: number): void;
  handleSaveSelectionToRelay(params: SaveSelectionParams): Promise<SaveSelectionResult>;
  insertProjectBrief(tabId: number, projectId?: string, source?: "sidebar" | "inline_chip" | "shortcut" | null): Promise<unknown>;
  refreshPageStateAndSyncIfMissing(tabId: number, reason: string): Promise<void>;
  requestPageStateFromTab(tabId: number): Promise<unknown>;
  scheduleAutoCapture(tabId: number, options?: { immediate?: boolean }): Promise<void>;
  showFailureToastInTab(tabId: number | null, message: string): Promise<void>;
}) {
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
        await deps.handleSaveSelectionToRelay({
          selectionText: info.selectionText,
          pageUrl,
          pageTitle: tab.title ?? null,
          platform: null,
          tabId: tab.id,
          trigger: "context_menu",
        });
      } catch (cause) {
        console.error("[relay] contextMenus.onClicked: unhandled", cause);
        await deps.showFailureToastInTab(
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
      void deps.refreshPageStateAndSyncIfMissing(tabId, "tab_complete");
    }
  },
);

chrome.runtime.onSuspend.addListener(() => {
  void flushBackgroundTelemetry();
});

chrome.tabs.onActivated.addListener((activeInfo: { tabId: number }) => {
  void deps.refreshPageStateAndSyncIfMissing(activeInfo.tabId, "tab_focus");
  const state = tabStates.get(activeInfo.tabId);

  if (
    state &&
    state.lastObservedSignature &&
    state.lastObservedSignature !== state.lastCapturedSignature
  ) {
    void deps.scheduleAutoCapture(activeInfo.tabId, { immediate: true });
  }
});

chrome.tabs.onRemoved.addListener((tabId: number) => {
  deps.clearTabState(tabId);
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

    await deps.requestPageStateFromTab(tab.id);
    await deps.insertProjectBrief(tab.id, undefined, "shortcut");
  })();
});


}
