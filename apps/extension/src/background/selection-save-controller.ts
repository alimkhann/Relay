import { createFlowId } from "@relay/shared/utils/telemetry";

import type { RelayMessage, RelayPageState } from "../messaging/contracts";
import { getRelaySession } from "../storage/session";
import { relayFetch } from "../utils/api";
import { readErrorResponse } from "./bg-utils";
import { invalidateProjectCache } from "./session-cache";
import { tabStates } from "./state";
import { getOrCreateTabState } from "./tab-state-store";
import { recordBackgroundTelemetry } from "./telemetry";

export interface SaveSelectionParams {
  selectionText: string;
  pageUrl: string | null;
  pageTitle: string | null;
  platform: string | null;
  extraMetadata?: Record<string, unknown>;
  tabId: number | null;
  projectIdOverride?: string | null;
  trigger: "context_menu" | "pin_selection";
}

export interface SaveSelectionResult {
  ok: boolean;
  reason?: string;
  projectId?: string;
}

// This is injected into arbitrary pages and therefore must remain closure-free.
export function relaySaveToastInPage(message: string) {
  const hostId = "relay-save-toast";
  document.getElementById(hostId)?.remove();
  const host = document.createElement("div");
  host.id = hostId;
  host.style.cssText = [
    "position:fixed", "bottom:24px", "right:24px", "z-index:2147483647",
    "max-width:340px", "padding:12px 16px", "border-radius:10px",
    "background:#18181b", "color:#fafafa",
    "font:500 13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "box-shadow:0 10px 32px rgba(0,0,0,0.35),0 0 0 1px rgba(255,255,255,0.08)",
    "opacity:0", "transform:translateY(8px)",
    "transition:opacity 180ms ease,transform 180ms ease", "pointer-events:none",
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

export function createSelectionSaveController(deps: {
  rememberProjectSelection: (
    projectId: string,
    tabId: number | null,
    pageState: RelayPageState,
    projectName?: string | null,
  ) => Promise<void>;
  syncTabRemoteState: (
    tabId: number,
    options?: { force?: boolean; reason?: string },
  ) => Promise<void>;
}) {
  async function showFailureToastInTab(tabId: number | null, message: string) {
    if (tabId === null) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: relaySaveToastInPage,
        args: [message],
      });
    } catch {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "RELAY_SHOW_SIMPLE_TOAST",
          payload: { message },
        });
      } catch {
        // Restricted pages have no available toast surface.
      }
    }
  }

  async function handleSaveSelectionToRelay(
    params: SaveSelectionParams,
  ): Promise<SaveSelectionResult> {
    const trimmed = params.selectionText.trim();
    const flowId = createFlowId("ext-save");
    if (!trimmed) {
      await showFailureToastInTab(params.tabId, "Select text on the page first.");
      return { ok: false, reason: "Select text in the page first." };
    }

    let projectId = params.projectIdOverride ?? null;
    if (!projectId && params.tabId !== null) {
      projectId = getOrCreateTabState(params.tabId).projectId ?? null;
    }
    if (!projectId) projectId = (await getRelaySession()).projectId || null;
    if (!projectId) {
      if (params.tabId !== null) {
        try {
          void chrome.sidePanel.open({ tabId: params.tabId });
        } catch {
          // Unsupported contexts cannot open the side panel.
        }
      }
      await showFailureToastInTab(
        params.tabId,
        "Pick a project in the Relay sidepanel, then try again.",
      );
      return { ok: false, reason: "Choose a project first." };
    }

    let hostname: string | null = null;
    try {
      hostname = params.pageUrl ? new URL(params.pageUrl).hostname : null;
    } catch {
      hostname = null;
    }
    const titleSource = params.pageTitle ?? hostname ?? params.platform ?? "web";
    let response: Response;
    try {
      response = await relayFetch(`/api/projects/${projectId}/memory`, {
        method: "POST",
        body: JSON.stringify({
          type: "note",
          pinned: true,
          title: `Saved from ${titleSource}`,
          content: trimmed,
          metadata: {
            ...(params.extraMetadata ?? {}),
            sourceUrl: params.pageUrl,
            sourceTitle: params.pageTitle,
            hostname,
            platform: params.platform ?? null,
            capturedVia: params.trigger,
          },
        }),
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Save to Relay failed.";
      await showFailureToastInTab(params.tabId, reason);
      return { ok: false, reason };
    }
    if (!response.ok) {
      const reason = await readErrorResponse(response, "Save to Relay failed.");
      await showFailureToastInTab(params.tabId, reason);
      return { ok: false, reason };
    }

    invalidateProjectCache(projectId);
    if (params.tabId !== null && tabStates.has(params.tabId)) {
      const state = getOrCreateTabState(params.tabId);
      try {
        await deps.rememberProjectSelection(
          projectId,
          params.tabId,
          state.page,
          state.projectName,
        );
      } catch {
        // Binding refresh is best-effort.
      }
      void deps.syncTabRemoteState(params.tabId, {
        force: true,
        reason: "save_to_project",
      });
    }
    recordBackgroundTelemetry({
      level: "info",
      surface: "extension-background",
      area: "memory",
      event: "selection_save_completed",
      flowId,
      message: `Saved selection to project ${projectId}.`,
      projectId,
      tabId: params.tabId,
      context: {
        trigger: params.trigger,
        hostname,
        textLength: trimmed.length,
        sourceUrl: params.pageUrl,
        chatProvider: params.platform,
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
      // Side panel may not be open.
    }
    return { ok: true, projectId };
  }

  return { handleSaveSelectionToRelay, showFailureToastInTab };
}
