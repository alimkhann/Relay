import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import {
  renameAssistantChatSchema,
  type AssistantActionResult,
  type AssistantAttachmentDto,
  type AssistantMessageDto,
  type AssistantMessageRole,
  type AssistantPendingAction
} from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"

async function loadOwnedChat(userId: string, id: string) {
  const repositories = createRepositoryBundle(userId)
  const chat = await repositories.assistantChats.getById(id)
  if (!chat || chat.userId !== userId) return { repositories, chat: null }
  return { repositories, chat }
}

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const { id } = await params
  const { repositories, chat } = await loadOwnedChat(viewer.userId, id)
  if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 })

  const rows = await repositories.assistantMessages.listByChat(chat.id)
  const attachments = await repositories.assistantAttachments.listByChat(chat.id)
  const attachmentsById = new Map(attachments.map((a) => [a.id, a]))
  const byId = new Map(rows.map((m) => [m.id, m]))
  const kept = (role: string, toolName: string | null) =>
    role === "user" || role === "assistant" || toolName === "pending_action"

  // Collapse tool rows so the client sees a clean user/assistant tree:
  // re-point each kept message to its nearest kept ancestor.
  const effectiveParent = (parentId: string | null): string | null => {
    let cursor = parentId ? byId.get(parentId) : undefined
    let guard = 0
    while (cursor && guard < 400) {
      if (kept(cursor.role, cursor.toolName)) return cursor.id
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      guard += 1
    }
    return null
  }
  const toolStepsFor = (parentId: string | null) => {
    const steps: NonNullable<AssistantMessageDto["toolSteps"]> = []
    let cursor = parentId ? byId.get(parentId) : undefined
    let guard = 0
    while (cursor && guard < 100 && cursor.role === "tool") {
      const payload = cursor.toolPayload as { activity?: NonNullable<AssistantMessageDto["toolSteps"]>[number] }
      if (payload.activity) steps.unshift(payload.activity)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      guard += 1
    }
    return steps
  }

  const messages: AssistantMessageDto[] = rows
    .filter((m) => kept(m.role, m.toolName))
    .map((m) => {
      const payload = m.toolPayload as {
        actionResult?: AssistantActionResult
        actionResults?: AssistantActionResult[]
        attachmentIds?: string[]
        pendingAction?: AssistantPendingAction
      }
      const pending = payload?.pendingAction ?? null
      const actionResults = [
        ...(payload?.actionResults ?? (payload?.actionResult ? [payload.actionResult] : [])),
        ...(pending?.result ? [pending.result] : []),
      ]
      const effectivePending =
        pending?.status === "succeeded" ||
        pending?.status === "failed" ||
        pending?.status === "declined"
          ? null
          : pending
      const messageAttachments: AssistantAttachmentDto[] = (payload?.attachmentIds ?? [])
        .map((id) => attachmentsById.get(id))
        .filter((a): a is (typeof attachments)[number] => Boolean(a))
        .map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mime: a.mime,
          byteSize: a.byteSize,
          hasText: Boolean(a.extractedText),
          savedToRelay: a.savedToRelay,
          createdAt: a.createdAt
        }))
      return {
        id: m.id,
        parentId: effectiveParent(m.parentId),
        role: (m.toolName === "pending_action" ? "assistant" : m.role) as AssistantMessageRole,
        content:
          m.toolName === "pending_action" && payload.pendingAction?.status !== "pending"
            ? ""
            : m.content,
        toolName: m.toolName,
        actionResult: actionResults[0] ?? null,
        actionResults,
        attachments: messageAttachments,
        feedback: m.feedback,
        createdAt: m.createdAt,
        pending: effectivePending,
        toolSteps: toolStepsFor(m.parentId),
      }
    })

  for (let index = 0; index < messages.length; index += 1) {
    const group: AssistantPendingAction[] = []
    let cursor = index
    while (
      cursor < messages.length &&
      messages[cursor]?.toolName === "pending_action" &&
      messages[cursor]?.pending
    ) {
      group.push(messages[cursor]!.pending!)
      cursor += 1
    }
    if (group.length > 1) {
      for (let groupIndex = index; groupIndex < cursor - 1; groupIndex += 1) {
        messages[groupIndex]!.pending = null
        messages[groupIndex]!.pendingActions = []
        messages[groupIndex]!.content = ""
      }
      messages[cursor - 1]!.pendingActions = group
      index = cursor - 1
    }
  }

  return NextResponse.json({
    chat: { id: chat.id, title: chat.title, surface: chat.surface, projectId: chat.projectId },
    messages
  })
})

export const PATCH = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const { id } = await params
  const { repositories, chat } = await loadOwnedChat(viewer.userId, id)
  if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  const { title } = renameAssistantChatSchema.parse(await request.json())
  await repositories.assistantChats.rename(chat.id, title)
  return NextResponse.json({ ok: true })
})

export const DELETE = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const { id } = await params
  const { repositories, chat } = await loadOwnedChat(viewer.userId, id)
  if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 })
  await repositories.assistantChats.remove(chat.id)
  return new NextResponse(null, { status: 204 })
})
