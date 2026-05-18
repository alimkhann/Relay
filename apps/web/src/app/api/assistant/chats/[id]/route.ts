import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import {
  renameAssistantChatSchema,
  type AssistantActionResult,
  type AssistantMessageDto
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
  const byId = new Map(rows.map((m) => [m.id, m]))
  const kept = (role: string) => role === "user" || role === "assistant"

  // Collapse tool rows so the client sees a clean user/assistant tree:
  // re-point each kept message to its nearest kept ancestor.
  const effectiveParent = (parentId: string | null): string | null => {
    let cursor = parentId ? byId.get(parentId) : undefined
    let guard = 0
    while (cursor && guard < 400) {
      if (kept(cursor.role)) return cursor.id
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      guard += 1
    }
    return null
  }

  const messages: AssistantMessageDto[] = rows
    .filter((m) => kept(m.role))
    .map((m) => {
      const payload = m.toolPayload as { actionResult?: AssistantActionResult }
      return {
        id: m.id,
        parentId: effectiveParent(m.parentId),
        role: m.role,
        content: m.content,
        toolName: m.toolName,
        actionResult: payload?.actionResult ?? null,
        feedback: m.feedback,
        createdAt: m.createdAt
      }
    })

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
