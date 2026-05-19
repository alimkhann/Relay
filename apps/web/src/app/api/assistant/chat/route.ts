import { sendAssistantMessageSchema, type AssistantStreamEvent } from "@relay/shared"

import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { runAssistantTurn } from "@/server/services/assistant-agent-service"
import {
  assertAssistantTokenBudget,
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
  if (!input.confirmActionId) {
    await consumeAssistantMessageQuota(viewer.userId)
  }

  captureServerEvent({
    event: "assistant_message_sent",
    distinctId: viewer.userId,
    properties: { surface: input.surface, plan }
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let totalTokens = 0
      const send = (event: AssistantStreamEvent) => {
        if (event.type === "usage") totalTokens = event.totalTokens
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
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
