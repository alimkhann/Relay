import { NextResponse } from "next/server"

import { listCachedMemoryForExplainability, type CachedMemoryListOptions } from "@/server/cache/read-model-cache"
import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import {
  consumeExtensionMemoryWriteQuota,
  consumeMcpReadQuota,
  consumeMcpWriteQuota,
} from "@/server/services/entitlement-service"
import { createMemoryItem } from "@/server/services/memory-service"
import { enqueuePersonalStateRegeneration } from "@/server/services/memory-pipeline-scheduler"
import { routePersonalMemory } from "@/server/services/personal-memory-service"

function decodeCursor(raw: string | null): CachedMemoryListOptions["cursor"] {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>
    if (
      typeof parsed.pinned === "boolean" &&
      typeof parsed.at === "string" &&
      typeof parsed.id === "string"
    ) {
      return { pinned: parsed.pinned, at: parsed.at, id: parsed.id }
    }
  } catch {}
  return null
}

function encodeCursor(item: Record<string, unknown> | undefined, sort: "updated_desc" | "created_desc"): string | null {
  if (!item) return null
  const at = sort === "created_desc" ? item.createdAt : item.updatedAt
  if (typeof item.id !== "string" || typeof at !== "string") return null
  return Buffer.from(JSON.stringify({
    pinned: Boolean(item.pinned),
    at,
    id: item.id,
  }), "utf8").toString("base64url")
}

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
    const requestedLimit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 200)
    const sort = searchParams.get("sort") === "created_desc" ? "created_desc" : "updated_desc"
    const options: CachedMemoryListOptions = {
      archived: searchParams.get("archived") === "true",
      pinned: searchParams.has("pinned") ? searchParams.get("pinned") === "true" : undefined,
      tag: searchParams.get("tag") ?? undefined,
      limit: limit + 1,
      sort,
      cursor: decodeCursor(searchParams.get("cursor")),
      types: types.length > 0 ? [...types].sort() as CachedMemoryListOptions["types"] : undefined,
    }
    const rows = await listCachedMemoryForExplainability(viewer.userId, id, options)
    const memory = rows.slice(0, limit)
    const nextCursor = rows.length > limit ? encodeCursor(memory[memory.length - 1] as Record<string, unknown> | undefined, sort) : null
    return NextResponse.json({ memory, nextCursor })
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

  // harvestOnly: skip primary item creation — only extract personal facts.
  // Used by the extension ignore-mode path where the chat isn't relevant to
  // the active project but personal facts should still land in Personal.
  if (body?.harvestOnly === true && body?.routingHint === "auto" && typeof body?.content === "string") {
    void routePersonalMemory(viewer.userId, id, body.content, {
      sourceSurface: body.sourceSurface ?? null,
    })
    return NextResponse.json({ harvested: true })
  }

  const item = await createMemoryItem(viewer.userId, { ...body, projectId: id })

  // Auto-capture (routingHint:"auto") additionally derives durable user facts
  // and routes the salient ones into the user's personal project. Fire-and-
  // forget — the project capture above is the primary, unaffected result.
  if (body?.routingHint === "auto" && typeof body?.content === "string") {
    void routePersonalMemory(viewer.userId, id, body.content, {
      sourceSurface: body.sourceSurface ?? null,
    })
  }

  // A manual add into a personal Folk category (note + metadata.personalCategory)
  // refreshes the derived "About you" state. Self-guards to the personal project.
  if (typeof body?.metadata?.personalCategory === "string") {
    void enqueuePersonalStateRegeneration(viewer.userId, id).catch(() => {})
  }

  return NextResponse.json({ item }, { status: 201 })
})
