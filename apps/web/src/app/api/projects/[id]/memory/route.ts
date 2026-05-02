import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { listMemoryForExplainability } from "@/server/services/continuity-explainability-service"
import {
  consumeExtensionMemoryWriteQuota,
  consumeMcpReadQuota,
  consumeMcpWriteQuota,
} from "@/server/services/entitlement-service"
import { createMemoryItem } from "@/server/services/memory-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }
  const { searchParams } = new URL(request.url)
  const types = searchParams.getAll("type")
  try {
    const memory = await listMemoryForExplainability(viewer.userId, id, {
      archived: searchParams.get("archived") === "true",
      pinned: searchParams.has("pinned") ? searchParams.get("pinned") === "true" : undefined,
      tag: searchParams.get("tag") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
      sort: searchParams.get("sort") === "created_desc" ? "created_desc" : "updated_desc",
      types: types.length > 0 ? types as Array<"note" | "decision" | "constraint" | "requirement" | "task" | "artifact"> : undefined,
    })
    return NextResponse.json({ memory })
  } catch (error) {
    console.error(
      `[api/projects/${id}/memory] GET failed for user ${viewer.userId}:`,
      error instanceof Error ? error.stack ?? error.message : error,
    )
    throw error
  }
})

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:write")
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
  } else if (viewer.mode === "extension") {
    await consumeExtensionMemoryWriteQuota(viewer.userId)
  }
  const body = await request.json()
  const item = await createMemoryItem(viewer.userId, { ...body, projectId: id })
  return NextResponse.json({ item }, { status: 201 })
})
