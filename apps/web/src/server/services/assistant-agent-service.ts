import { randomUUID } from "node:crypto"

import { createRepositoryBundle } from "@relay/db"
import type { AssistantStreamEvent, SendAssistantMessageInput } from "@relay/shared"

import { RelayHttpMcpClient } from "@/app/api/mcp/stream/relay-http-mcp-client"
import { logServerEvent } from "@/server/logging/logger"
import type { Viewer } from "@/server/policies/viewer"
import {
  ASSISTANT_TOOL_DECLARATIONS,
  DESTRUCTIVE_TOOLS,
  executeAssistantTool,
  type AssistantPlan
} from "@/server/services/assistant-tools"
import { GeminiRequestError, runGeminiAgentStep, type GeminiContent } from "@/server/services/gemini-service"

const AGENT_MODEL = process.env.GEMINI_MODEL_ASSISTANT ?? "gemini-3-flash-preview"
const MAX_OUTPUT_TOKENS = 1_400

function systemInstruction(defaultProjectId: string | null): string {
  return [
    "You are Ask Relay, an agent embedded in the Relay product (a cross-AI context manager).",
    "You help the user act on their own Relay data: projects, memory items, briefs, and continuity.",
    "Always prefer calling a tool to fetch real data over guessing. Call list_projects first if you need a projectId.",
    defaultProjectId ? `The active project id is ${defaultProjectId}; use it unless the user means another.` : "",
    "Be concise. After acting, briefly state what you did. Never invent ids or data.",
    "Destructive changes (deleting/archiving/updating saved memory or project state) require user confirmation; only call those tools when the user clearly asked."
  ]
    .filter(Boolean)
    .join(" ")
}

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + 28))
    i += 28
  }
  return chunks
}

interface PendingActionPayload {
  pendingAction: { id: string; tool: string; summary: string; args: Record<string, unknown> }
}

function describeToolCall(tool: string, args: Record<string, unknown>): string {
  if (tool === "manage_memory") {
    const action = String(args.action ?? "change")
    const ids = Array.isArray(args.memoryId) ? args.memoryId.length : 1
    return `${action} ${ids} memory item(s)`
  }
  if (tool === "set_project_state") return "update project state"
  return `run ${tool}`
}

export async function* runAssistantTurn(
  viewer: Viewer,
  input: SendAssistantMessageInput,
  options: { plan: AssistantPlan; maxSteps: number }
): AsyncGenerator<AssistantStreamEvent> {
  const repositories = createRepositoryBundle(viewer.userId)
  const client = new RelayHttpMcpClient(viewer)
  const maxSteps = Math.max(1, options.maxSteps)

  // 1. Resolve or create the chat (RLS scopes rows to the viewer).
  let chat = input.chatId ? await repositories.assistantChats.getById(input.chatId) : null
  if (chat && chat.userId !== viewer.userId) chat = null
  if (!chat) {
    chat = await repositories.assistantChats.create({
      userId: viewer.userId,
      projectId: input.projectId ?? null,
      surface: input.surface,
      title: input.message.slice(0, 60)
    })
  }
  yield { type: "chat", chatId: chat.id }

  const defaultProjectId = chat.projectId ?? input.projectId ?? null

  // 2. Rebuild conversation along the active branch path only. Editing an
  //    earlier user message sends its parent as input.parentId, so the new
  //    turn naturally branches with the correct (shorter) context.
  const allMessages = await repositories.assistantMessages.listByChat(chat.id, { limit: 400 })
  const byId = new Map(allMessages.map((m) => [m.id, m]))
  const pathMessages: typeof allMessages = []
  let cursor = input.parentId ? byId.get(input.parentId) : undefined
  let guard = 0
  while (cursor && guard < 400) {
    pathMessages.unshift(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    guard += 1
  }

  const contents: GeminiContent[] = []
  for (const m of pathMessages) {
    if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.content }] })
    else if (m.role === "assistant" && m.content) contents.push({ role: "model", parts: [{ text: m.content }] })
  }

  // 3. Persist the new user message under its branch parent.
  const userMessage = await repositories.assistantMessages.create({
    chatId: chat.id,
    userId: viewer.userId,
    parentId: input.parentId ?? null,
    role: "user",
    content: input.message
  })
  let tailId = userMessage.id
  let userText = input.message
  if (input.pageContext?.url || input.pageContext?.selection) {
    userText += `\n\n[Page context] ${input.pageContext.title ?? ""} ${input.pageContext.url ?? ""}\n${(input.pageContext.selection ?? "").slice(0, 4000)}`
  }
  contents.push({ role: "user", parts: [{ text: userText }] })

  let totalTokens = 0

  // 4. Confirmed destructive action: execute the stored pending action first.
  if (input.confirmActionId) {
    const pending = pathMessages
      .filter((m) => m.toolName === "pending_action")
      .map((m) => (m.toolPayload as unknown as PendingActionPayload).pendingAction)
      .find((p) => p?.id === input.confirmActionId)
    if (pending) {
      yield { type: "tool_start", tool: pending.tool }
      try {
        const exec = await executeAssistantTool(client, pending.tool, pending.args, { plan: options.plan })
        if (exec.actionResult) yield { type: "tool_result", result: exec.actionResult }
        contents.push({
          role: "model",
          parts: [{ functionCall: { name: pending.tool, args: pending.args } }]
        })
        contents.push({
          role: "function",
          parts: [{ functionResponse: { name: pending.tool, response: exec.modelResponse } }]
        })
      } catch (error) {
        yield { type: "error", message: error instanceof Error ? error.message : "Action failed." }
        return
      }
    }
  }

  // 5. Bounded tool-call loop.
  for (let step = 0; step < maxSteps; step += 1) {
    let stepResult
    try {
      stepResult = await runGeminiAgentStep({
        model: AGENT_MODEL,
        systemInstruction: systemInstruction(defaultProjectId),
        contents,
        tools: ASSISTANT_TOOL_DECLARATIONS,
        maxOutputTokens: MAX_OUTPUT_TOKENS
      })
    } catch (error) {
      const message =
        error instanceof GeminiRequestError
          ? "The assistant is temporarily unavailable. Please try again."
          : error instanceof Error
            ? error.message
            : "The assistant failed to respond."
      yield { type: "error", message }
      return
    }

    totalTokens += stepResult.tokenUsage.totalTokens

    if (stepResult.functionCalls.length === 0) {
      const finalText = stepResult.text || "Done."
      for (const delta of chunkText(finalText)) {
        yield { type: "text", delta }
      }
      const saved = await repositories.assistantMessages.create({
        chatId: chat.id,
        userId: viewer.userId,
        parentId: tailId,
        role: "assistant",
        content: finalText,
        tokenOutput: stepResult.tokenUsage.outputTokens,
        tokenInput: stepResult.tokenUsage.inputTokens
      })
      await repositories.assistantChats.touch(chat.id)
      yield { type: "usage", totalTokens }
      yield { type: "done", messageId: saved.id }
      return
    }

    for (const call of stepResult.functionCalls) {
      const needsConfirm =
        DESTRUCTIVE_TOOLS.has(call.name) && !input.confirmActionId
      if (needsConfirm) {
        const actionId = randomUUID()
        const summary = describeToolCall(call.name, call.args)
        const payload: PendingActionPayload = {
          pendingAction: { id: actionId, tool: call.name, summary, args: call.args }
        }
        await repositories.assistantMessages.create({
          chatId: chat.id,
          userId: viewer.userId,
          parentId: tailId,
          role: "assistant",
          content: `Awaiting confirmation to ${summary}.`,
          toolName: "pending_action",
          toolPayload: payload as unknown as Record<string, unknown>
        })
        await repositories.assistantChats.touch(chat.id)
        yield {
          type: "pending_action",
          action: { id: actionId, tool: call.name, summary, args: call.args }
        }
        yield { type: "usage", totalTokens }
        yield { type: "done", messageId: actionId }
        return
      }

      yield { type: "tool_start", tool: call.name }
      let exec
      try {
        exec = await executeAssistantTool(client, call.name, call.args, { plan: options.plan })
      } catch (error) {
        exec = {
          modelResponse: {
            error: error instanceof Error ? error.message : "Tool execution failed."
          },
          actionResult: null as null
        }
      }
      void logServerEvent({
        level: "info",
        surface: "web-api",
        area: "assistant",
        event: "assistant.tool_invoked",
        message: `assistant tool ${call.name}`,
        context: { userId: viewer.userId, tool: call.name }
      })
      if (exec.actionResult) yield { type: "tool_result", result: exec.actionResult }
      const toolMsg = await repositories.assistantMessages.create({
        chatId: chat.id,
        userId: viewer.userId,
        parentId: tailId,
        role: "tool",
        content: "",
        toolName: call.name,
        toolPayload: { args: call.args, response: exec.modelResponse }
      })
      tailId = toolMsg.id
      contents.push({ role: "model", parts: [{ functionCall: { name: call.name, args: call.args } }] })
      contents.push({
        role: "function",
        parts: [{ functionResponse: { name: call.name, response: exec.modelResponse } }]
      })
    }
  }

  // 6. Step budget exhausted (hard cost ceiling).
  const cappedText =
    "I reached the step limit for this request. Here's where I got to — ask me to continue if you'd like."
  for (const delta of chunkText(cappedText)) yield { type: "text", delta }
  const saved = await repositories.assistantMessages.create({
    chatId: chat.id,
    userId: viewer.userId,
    parentId: tailId,
    role: "assistant",
    content: cappedText
  })
  await repositories.assistantChats.touch(chat.id)
  yield { type: "usage", totalTokens }
  yield { type: "done", messageId: saved.id }
}
