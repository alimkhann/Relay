import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import { createAssistantChatSchema, type AssistantChatSummaryDto } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"

function toSummary(row: {
  id: string
  title: string
  surface: AssistantChatSummaryDto["surface"]
  projectId: string | null
  updatedAt: string
}): AssistantChatSummaryDto {
  return {
    id: row.id,
    title: row.title,
    surface: row.surface,
    projectId: row.projectId,
    updatedAt: row.updatedAt
  }
}

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const url = new URL(request.url)
  const q = url.searchParams.get("q")?.trim()
  const repositories = createRepositoryBundle(viewer.userId)
  const rows = q
    ? await repositories.assistantChats.searchByUser(viewer.userId, q)
    : await repositories.assistantChats.listByUser(viewer.userId)
  return NextResponse.json({ chats: rows.map(toSummary) })
})

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const input = createAssistantChatSchema.parse(await request.json().catch(() => ({})))
  const repositories = createRepositoryBundle(viewer.userId)
  const chat = await repositories.assistantChats.create({
    userId: viewer.userId,
    projectId: input.projectId ?? null,
    surface: input.surface,
    title: input.title
  })
  return NextResponse.json({ chat: toSummary(chat) }, { status: 201 })
})
