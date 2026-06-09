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

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer, "Ask Relay is not available to scoped MCP tokens.")

  const input = sendAssistantMessageSchema.parse(await request.json())
  const entitlements = await resolveViewerEntitlements(viewer.userId)
  const plan = entitlements.plan

  // Hard monthly token ceiling. Gate both new messages and confirmations
  // (a confirmation resumes the turn and spends more tokens) before any work.
  await assertAssistantTokenBudget(viewer.userId)

  // A confirmation continues an existing turn and is not a new billable message.
  if (
    input.message.trim().toLowerCase() !== "/compact" &&
    !input.confirmActionId &&
    input.actionDecision?.decision !== "allow"
  ) {
    await consumeAssistantMessageQuota(viewer.userId)
  }
  const actionQuota = classifyAssistantActionQuota(input.message, input.actionDecision)
  if (actionQuota) await consumeActionQuota(viewer.userId, actionQuota)

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
