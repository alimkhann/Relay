import type { RelayPageState } from "../messaging/contracts";
import { shouldSyncMissingRemoteState } from "./remote-sync-policy";
import { getOrCreateTabState, updateTabPageState } from "./tab-state-store";

export interface PageController {
  requestPageStateFromTab(tabId: number): Promise<RelayPageState>;
  refreshPageStateAndSyncIfMissing(tabId: number, reason: string): Promise<void>;
}

export function detectPlatformFromTabUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;
    if (host === "codex.openai.com" || (host.endsWith("openai.com") && path.includes("/codex"))) {
      return "codex";
    }
    if (host === "chatgpt.com" || host === "chat.openai.com") return "chatgpt";
    if (host === "claude.ai" || host.endsWith(".claude.ai")) return "claude";
    if (host === "perplexity.ai" || host.endsWith(".perplexity.ai")) return "perplexity";
    if (host === "gemini.google.com" || host === "aistudio.google.com") return "gemini";
    if (host === "grok.com" || (host === "x.com" && path.startsWith("/i/grok"))) return "grok";
    if (host === "chat.deepseek.com") return "deepseek";
    return null;
  } catch {
    return null;
  }
}

export function createPageController(deps: {
  syncTabRemoteState: (
    tabId: number,
    options?: { force?: boolean; reason?: string },
  ) => Promise<void>;
}): PageController {
  async function ensureContentScriptInjected(tabId: number) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || !detectPlatformFromTabUrl(tab.url)) return;
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          ...((chrome.runtime.getManifest().content_scripts?.[0]?.js as string[]) ?? []),
        ],
      });
    } catch {
      // Special/closed tabs cannot receive the content script.
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
    if (!page.supported) {
      await ensureContentScriptInjected(tabId);
      await new Promise((resolve) => setTimeout(resolve, 300));
      page = await attempt();
    }
    if (!page.supported) {
      try {
        const tab = await chrome.tabs.get(tabId);
        const platform = tab.url ? detectPlatformFromTabUrl(tab.url) : null;
        if (tab.url && platform) {
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
      } catch {
        // tabs.get can fail if the tab closed.
      }
    }
    updateTabPageState(tabId, page);
    return page;
  }

  async function refreshPageStateAndSyncIfMissing(tabId: number, reason: string) {
    await requestPageStateFromTab(tabId);
    const state = getOrCreateTabState(tabId);
    if (
      shouldSyncMissingRemoteState({
        pageSupported: state.page.supported,
        remoteStatus: state.remoteStatus,
        lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      })
    ) {
      await deps.syncTabRemoteState(tabId, { reason });
    }
  }

  return { requestPageStateFromTab, refreshPageStateAndSyncIfMissing };
}
