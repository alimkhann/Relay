import { NextResponse } from "next/server"
import { bootstrapRequestSchema } from "@relay/shared"
import { z } from "zod"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { generateBootstrapForProject, listBootstrapPacketsForProject } from "@/server/services/bootstrap-service"
import { consumeMcpReadQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { clearProjectBriefs, deleteProjectBrief, editProjectBrief } from "@/server/services/project-governance-service"
import { recordSyncMarkForUser } from "@/server/services/sync-mark-service"

export const maxDuration = 60

const packetIdSchema = z.object({
  packetId: z.string().uuid(),
})

const editBriefSchema = z.object({
  packetId: z.string().uuid(),
  content: z.string().min(1),
})

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }

  const { searchParams } = new URL(request.url)
  const limit = searchParams.get("limit")
  const packets = await listBootstrapPacketsForProject(viewer.userId, id)

  return NextResponse.json({
    packets: typeof limit === "string"
      ? packets.slice(0, Math.max(1, Number(limit) || 20))
      : packets,
  })
})

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")
  const input = await request.json()
  const parsed = bootstrapRequestSchema.parse(input)
  if (viewer.mode === "mcp") {
    const readMode = parsed.deep || parsed.packetMode === "agent_full_bootstrap" ? "deep" : "basic"
    await consumeMcpReadQuota(viewer.userId, readMode)
  }
  const result = await generateBootstrapForProject(viewer.userId, id, input)
  if (result.status === "ready" && input && typeof input === "object" && "syncSurface" in input && typeof input.syncSurface === "string") {
    await recordSyncMarkForUser(viewer.userId, id, input.syncSurface)
  }
  return NextResponse.json(result, { status: result.status === "pending" ? 202 : 201 })
})

export const DELETE = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")

  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
  }

  const { searchParams } = new URL(request.url)
  const packetId = searchParams.get("packetId")

  if (!packetId) {
    await clearProjectBriefs(viewer.userId, id)
    return NextResponse.json({ ok: true })
  }

  const parsed = packetIdSchema.parse({ packetId })
  await deleteProjectBrief(viewer.userId, id, parsed.packetId)
  return NextResponse.json({ ok: true })
})

export const PATCH = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")

  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
  }

  const parsed = editBriefSchema.parse(await request.json())
  const packet = await editProjectBrief(viewer.userId, id, parsed.packetId, parsed.content)
  return NextResponse.json({ ok: true, packet })
})
