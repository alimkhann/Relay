import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import { withApiAuth } from "@/server/http/api-route"
import { requireViewerScope, resolveViewer } from "@/server/policies/viewer"
import { getMemoryForExplainability } from "@/server/services/continuity-explainability-service"
import { consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { deleteMemoryItem, updateMemoryItem } from "@/server/services/memory-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  requireViewerScope(viewer, "memory:read")
  const { id } = await params
  const item = await getMemoryForExplainability(viewer.userId, id, viewer.mode === "mcp" ? viewer.projectId ?? undefined : undefined)
  if (!item) {
    return NextResponse.json({ error: "Memory item not found." }, { status: 404 })
  }
  return NextResponse.json({ item })
})

export const PATCH = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  requireViewerScope(viewer, "memory:write")
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
  }
  const { id } = await params
  const repositories = createRepositoryBundle(viewer.userId)
  const existing = await repositories.memory.getById(id)
  if (viewer.mode === "mcp" && existing?.projectId !== viewer.projectId) {
    return NextResponse.json({ error: "This MCP token cannot access memory from another project." }, { status: 403 })
  }
  const item = await updateMemoryItem(viewer.userId, id, await request.json(), viewer.mode === "mcp" ? viewer.projectId ?? undefined : undefined)
  return NextResponse.json({ item })
})

export const DELETE = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  requireViewerScope(viewer, "memory:write")
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
  }
  const { id } = await params
  const repositories = createRepositoryBundle(viewer.userId)
  const existing = await repositories.memory.getById(id)
  if (viewer.mode === "mcp" && existing?.projectId !== viewer.projectId) {
    return NextResponse.json({ error: "This MCP token cannot access memory from another project." }, { status: 403 })
  }
  await deleteMemoryItem(viewer.userId, id, viewer.mode === "mcp" ? viewer.projectId ?? undefined : undefined)
  return new NextResponse(null, { status: 204 })
})
