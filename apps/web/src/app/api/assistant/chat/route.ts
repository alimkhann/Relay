import { sendAssistantMessageSchema, type AssistantStreamEvent } from "@relay/shared"

import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { classifyAssistantActionQuota, runAssistantTurn } from "@/server/services/assistant-agent-service"
import {
  assertAssistantTokenBudget,
  consumeActionQuota,
  consumeAssistantMessageQuota,
  consumeAssistantTokenQuota,
  resolveViewerEntitlements
} from "@/server/services/entitlement-service"

export const dynamic = "force-dynamic"

// Rough blended $/1M tokens for ANALYTICS cost attribution only (not billing).
const ASSISTANT_USD_PER_MTOK: Record<string, number> = {
  "Gemini Flash": 0.3,
  "Gemini Flash-Lite": 0.1
}

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer, "Ask Relay is not available to scoped MCP tokens.")

  const input = sendAssistantMessageSchema.parse(await request.json())
  const entitlements = await resolveViewerEntitlements(viewer.userId)
  const plan = entitlements.plan

  // Hard monthly token ceiling. Gate both new messages and confirmations
  // (a confirmation resumes the turn and spends more tokens) before any work.
  await assertAssistantTokenBudget(viewer.userId)

  // Confirmations and declines resume an existing turn — not a new billable message.
  const isTurnContinuation =
    input.actionDecision?.decision === "allow" || input.actionDecision?.decision === "decline"
  if (
    input.message.trim().toLowerCase() !== "/compact" &&
    !input.confirmActionId &&
    !isTurnContinuation
  ) {
    await consumeAssistantMessageQuota(viewer.userId)
  }
  const actionQuota = classifyAssistantActionQuota(input.message, input.actionDecision)
  const shouldChargeActionQuota =
    !input.confirmActionId && input.actionDecision?.decision !== "allow"
  const actionCount =
    input.actionDecision?.actionIds?.length ?? (input.actionDecision ? 1 : 0)
  if (actionQuota && shouldChargeActionQuota && actionCount > 0) {
    await consumeActionQuota(viewer.userId, actionQuota, actionCount)
  }

  captureServerEvent({
    event: "assistant_message_sent",
    distinctId: viewer.userId,
    properties: {
      surface: input.surface,
      plan,
      webSearch: input.webSearch === true,
      intentRoute: actionQuota ?? (input.webSearch ? "web" : "direct"),
      actionCount: input.actionDecision?.actionIds?.length ?? (input.actionDecision ? 1 : 0)
    }
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let totalTokens = 0
      const send = (event: AssistantStreamEvent) => {
        if (event.type === "usage") totalTokens = event.totalTokens
        if (event.type === "error") {
          // Stable failure taxonomy so prod errors are diagnosable in PostHog
          // (the old generic banner left no trace of WHY turns failed).
          captureServerEvent({
            event: "assistant_turn_failed",
            distinctId: viewer.userId,
            properties: {
              surface: input.surface,
              plan,
              code: event.code ?? "internal",
              message: event.message.slice(0, 200)
            }
          })
        }
        const outgoing =
          event.type === "usage"
            ? {
                ...event,
                maxContextTokens: 1_000_000,
                model: actionQuota || input.webSearch ? "Gemini Flash" : "Gemini Flash-Lite"
              }
            : event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(outgoing)}\n\n`))
      }
      try {
        for await (const event of runAssistantTurn(viewer, input, {
          plan,
          maxSteps: entitlements.limits.assistantMaxSteps
        })) {
          send(event)
        }
      } catch (error) {
        send({
          type: "error",
          code: "internal",
          message: error instanceof Error ? error.message : "The assistant failed to respond."
        })
      } finally {
        if (totalTokens > 0) {
          // Soft monthly token ceiling — recorded after the turn so the
          // current response always completes; the next turn is blocked
          // if the cap is exceeded.
          await consumeAssistantTokenQuota(viewer.userId, totalTokens).catch(() => {})
        }
        captureServerEvent({
          event: "assistant_turn_completed",
          distinctId: viewer.userId,
          properties: {
            surface: input.surface,
            plan,
            totalTokens,
            intentRoute: actionQuota ?? (input.webSearch ? "web" : "direct")
          }
        })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  })
})
