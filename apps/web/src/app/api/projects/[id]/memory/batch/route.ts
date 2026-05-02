import { NextResponse } from "next/server"

import { createMemoryItemSchema } from "@relay/shared"
import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { createMemoryItemBatch } from "@/server/services/memory-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:write")
  const body = await request.json() as { items?: unknown[] }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items array is required and must be non-empty" }, { status: 400 })
  }

  if (body.items.length > 50) {
    return NextResponse.json({ error: "Maximum 50 items per batch" }, { status: 400 })
  }

  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId, body.items.length)
  }

  const items = body.items.map((raw) => {
    const parsed = createMemoryItemSchema.parse({ ...raw as Record<string, unknown>, projectId: id })
    return parsed
  })

  const created = await createMemoryItemBatch(viewer.userId, id, items)
  return NextResponse.json({ items: created }, { status: 201 })
})
