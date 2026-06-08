import { readRateLimitError, relayFetch } from "../utils/api";
import {
  CAPTURE_API_TIMEOUT_MS,
  CAPTURE_TAB_MESSAGE_TIMEOUT_MS,
  readErrorResponse,
  sendTabMessageWithTimeout,
} from "./bg-utils";
import { filterInsertedContextCapture } from "./inserted-context-capture";
import {
  capturedTurnsMatchPendingInsertedBrief,
  getOrCreateTabState,
} from "./tab-state-store";

export async function captureTab(
  projectId: string,
  tabId: number,
  options: {
    processingMode?: "default" | "fast_ack";
    additionalProjectIds?: string[];
  } = {},
) {
  const startedAt = Date.now();
  const state = getOrCreateTabState(tabId);
  const result = await sendTabMessageWithTimeout<any>(
    tabId,
    { type: "RELAY_CAPTURE_VISIBLE", payload: { projectId, tabId } },
    CAPTURE_TAB_MESSAGE_TIMEOUT_MS,
    "RELAY_CAPTURE_VISIBLE",
  );

  console.warn("[Relay BG] capture content response", {
    tabId,
    projectId,
    ok: result?.ok ?? false,
    reason: result?.reason ?? null,
    turns: result?.capture?.turns?.length ?? 0,
    signature: result?.capture?.session.captureSignature ?? null,
    sourceConversationId: result?.capture?.session.sourceConversationId ?? null,
    durationMs: Date.now() - startedAt,
  });
  if (!result?.ok || !result.capture) {
    return result ?? { ok: false, reason: "Capture failed." };
  }

  let capturePayload = result.capture;
  if (
    state.pendingInsertedBrief &&
    capturedTurnsMatchPendingInsertedBrief(state.pendingInsertedBrief, capturePayload.turns)
  ) {
    const filtered = filterInsertedContextCapture({
      turns: capturePayload.turns,
      pending: {
        packetId: state.pendingInsertedBrief.packetId,
        insertKind: state.pendingInsertedBrief.insertKind,
        insertedContent: state.pendingInsertedBrief.insertedContent,
        insertedContentHash: state.pendingInsertedBrief.insertedContentHash,
      },
    });
    if (filtered.kind === "skip") {
      return {
        ok: true,
        sessionId: null,
        turns: 0,
        digestQueued: false,
        digestStrategy: "skip" as const,
        digestOutcome: null,
        budgetStatus: null,
        stateStatus: state.stateStatus ?? null,
        reconciliation: null,
        skippedInsertedContext: true,
        reason: filtered.reason,
      };
    }
    capturePayload = {
      ...capturePayload,
      turns: filtered.turns,
      session: {
        ...capturePayload.session,
        metadata: {
          ...(capturePayload.session.metadata ?? {}),
          relayInsertedContext: filtered.metadata,
        },
      },
    };
  }

  let response: Response;
  try {
    response = await relayFetch(
      "/api/captures",
      {
        method: "POST",
        body: JSON.stringify({
          projectId,
          processingMode: options.processingMode,
          ...capturePayload,
          additionalProjectIds: options.additionalProjectIds?.length
            ? options.additionalProjectIds
            : undefined,
        }),
      },
      { timeoutMs: CAPTURE_API_TIMEOUT_MS },
    );
  } catch (cause) {
    const reason =
      cause instanceof DOMException && cause.name === "AbortError"
        ? `Capture request timed out after ${CAPTURE_API_TIMEOUT_MS}ms.`
        : cause instanceof Error
          ? cause.message
          : "Capture request failed.";
    return { ok: false, reason };
  }

  if (!response.ok) {
    const rateLimitError = await readRateLimitError(response);
    return {
      ok: false,
      reason:
        rateLimitError?.message ??
        (await readErrorResponse(response, "Capture request failed.")),
    };
  }
  const payload = await response.json();
  return {
    ok: true,
    sessionId: payload.session?.id ?? null,
    turns: payload.turns?.length ?? capturePayload.turns?.length ?? 0,
    digestQueued: Boolean(payload.digestQueued),
    digestStrategy: (payload.digestStrategy ?? "skip") as "ai" | "deferred" | "skip",
    digestOutcome: payload.digestOutcome ?? null,
    budgetStatus: payload.budgetStatus ?? null,
    stateStatus: payload.stateStatus ?? null,
    reconciliation: payload.reconciliation ?? null,
    personalRouting: payload.personalRouting ?? null,
  };
}

export type CaptureTabResult = Awaited<ReturnType<typeof captureTab>>;
