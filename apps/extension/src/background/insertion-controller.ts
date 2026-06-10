import { createFlowId } from "@relay/shared/utils/telemetry";
import { resolveTargetProfile } from "../utils/target-profile";
import type { RelayInsertState, RelayPageState } from "../messaging/contracts";
import { getRelaySession, setRelaySession } from "../storage/session";
import { relayFetch } from "../utils/api";
import { readErrorResponse } from "./bg-utils";
import { invalidateProjectCache } from "./session-cache";
import { looksLikeFreshChatRoute } from "./tab-state";
import {
  buildPendingInsertedBriefState,
  clearInsertStateTimer,
  getOrCreateTabState,
  setInsertState,
} from "./tab-state-store";
import { recordBackgroundTelemetry } from "./telemetry";

export function createInsertionController(deps: {
  requestPageStateFromTab(tabId: number): Promise<RelayPageState>;
  syncTabRemoteState(
    tabId: number,
    options?: { force?: boolean; reason?: string },
  ): Promise<void>;
  rememberProjectSelection(
    projectId: string,
    tabId: number | null,
    pageState: RelayPageState,
    projectName?: string | null,
  ): Promise<void>;
  broadcastActiveProjectState(tabId: number): Promise<void>;
  scheduleInsertStateReset(tabId: number, delayMs?: number): void;
}) {
  async function insertProjectBrief(
    tabId: number,
    explicitProjectId?: string,
    source: RelayInsertState["source"] = "sidebar",
  ) {
    try {
    const state = getOrCreateTabState(tabId);
    const pageState = state.page.supported
      ? state.page
      : await deps.requestPageStateFromTab(tabId);
    if (!pageState.supported) {
      return { ok: false, reason: "Insert project brief works only on a supported AI tab." };
    }
    if (!state.projectId && !explicitProjectId) {
      await deps.syncTabRemoteState(tabId, {
        force: true,
        reason: "insert_needs_project",
      });
    }

    const session = await getRelaySession();
    const projectId = explicitProjectId ?? getOrCreateTabState(tabId).projectId ?? "";
    if (!projectId) return { ok: false, reason: "Choose a project first." };

    const flowId = createFlowId("ext-insert");
    clearInsertStateTimer(state);
    setInsertState(state, {
      status: "inserting",
      source,
      message: "Inserting project brief…",
    });
    await deps.broadcastActiveProjectState(tabId);

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
        packetMode: "chat_smart_delta",
        deep: false,
        syncSurface: pageState.platform ?? undefined,
      }),
    });
    if (!response.ok) {
      const reason = await readErrorResponse(response, "Project brief generation failed.");
      state.lastError = reason;
      setInsertState(state, { status: "error", source, message: reason });
      await deps.broadcastActiveProjectState(tabId);
      deps.scheduleInsertStateReset(tabId);
      return { ok: false, reason };
    }

    const generated = (await response.json()) as {
      status?: "ready" | "pending";
      packet?: {
        id?: string;
        content?: string;
        generationMetadata?: Record<string, unknown>;
      };
      reason?: string | null;
      stateStatus?: unknown;
    };
    if (generated.stateStatus) await setRelaySession({ stateStatus: generated.stateStatus as any });
    if (generated.status === "pending" || !generated.packet?.content) {
      const reason = generated.reason ?? "Relay is still preparing your project brief.";
      setInsertState(state, { status: "error", source, message: reason });
      await deps.broadcastActiveProjectState(tabId);
      deps.scheduleInsertStateReset(tabId);
      return { ok: false, reason };
    }

    const inserted = await chrome.tabs.sendMessage(tabId, {
      type: "RELAY_INSERT_CONTEXT",
      payload: { content: generated.packet.content },
    });
    if (!inserted?.ok) {
      const reason = inserted?.reason ?? "Insert failed.";
      setInsertState(state, { status: "error", source, message: reason });
      await deps.broadcastActiveProjectState(tabId);
      deps.scheduleInsertStateReset(tabId);
      return { ok: false, reason };
    }

    state.pendingInsertedBrief = buildPendingInsertedBriefState({
      projectId,
      projectName: state.projectName ?? "",
      packetId: generated.packet.id ?? null,
      insertKind: kind,
      page: pageState,
      content: generated.packet.content,
    });
    await deps.rememberProjectSelection(projectId, tabId, pageState, state.projectName);
    invalidateProjectCache(projectId);
    const actualModel = String(generated.packet.generationMetadata?.actual_model ?? "");
    const limitedMode = actualModel === "deterministic";
    await setRelaySession({
      limitedMode,
      lastStatus: limitedMode ? "Inserted a limited project brief." : "Inserted the project brief.",
      assumedProjectId: projectId,
      assumedProjectName: state.projectName ?? "",
    });
    setInsertState(state, {
      status: "inserted",
      source,
      message: limitedMode ? "Inserted a limited project brief." : "Inserted the project brief.",
    });
    await deps.broadcastActiveProjectState(tabId);
    deps.scheduleInsertStateReset(tabId);
    await deps.syncTabRemoteState(tabId, { force: true, reason: "insert_complete" });
    recordBackgroundTelemetry({
      level: "info",
      surface: "extension-background",
      area: "brief",
      event: "brief_insert_completed",
      flowId,
      message: "Inserted the project brief into the chat input.",
      projectId,
      tabId,
      context: { source, targetSurface: source, limitedMode, kind, actualModel: actualModel || null },
    });
    return { ok: true, limitedMode, stateStatus: generated.stateStatus ?? null };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Insert project brief failed.";
      recordBackgroundTelemetry({
        level: "error",
        surface: "extension-background",
        area: "brief",
        event: "brief_insert_failed",
        flowId: createFlowId(),
        message: reason,
        tabId,
        error: cause,
      });
      return { ok: false, reason };
    }
  }

  return { insertProjectBrief };
}
