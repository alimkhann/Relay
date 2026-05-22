import { NextResponse } from "next/server"

import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerScope } from "@/server/policies/viewer"
import {
  consumeExtensionMemoryWriteQuota,
  consumeMcpReadQuota,
  consumeMcpWriteQuota,
} from "@/server/services/entitlement-service"
import { createMemoryItem } from "@/server/services/memory-service"

/**
 * Memory v2: space-scoped memory endpoint. Personal-space writes land here
 * because they have no backing project. Project-space writes still flow
 * through /api/projects/[id]/memory for back-compat — both paths resolve
 * to the same memory_items row, just labeled with space_id.
 */

async function resolveSpaceForViewer(
  repositories: RepositoryBundle,
  viewerUserId: string,
  spaceId: string,
): Promise<{ id: string; kind: "personal" | "project"; ownerId: string; projectId: string | null } | null> {
  const rows = await repositories.provider.query(
    `SELECT s.id, s.kind, s.owner_id, s.project_id
     FROM spaces s
     JOIN space_members sm ON sm.space_id = s.id
     WHERE s.id = $1
       AND sm.user_id = $2
     LIMIT 1`,
    [spaceId, viewerUserId],
  )
  if (rows.length === 0) return null
  const r = rows[0] as Record<string, unknown>
  return {
    id: String(r.id),
    kind: String(r.kind) as "personal" | "project",
    ownerId: String(r.owner_id),
    projectId: r.project_id ? String(r.project_id) : null,
  }
}

export const GET = withApiAuth(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await resolveViewer(request.headers.get("authorization"))
    requireViewerScope(viewer, "memory:read")
    if (viewer.mode === "mcp") {
      await consumeMcpReadQuota(viewer.userId)
    }
    const { id } = await params
    const repositories = createRepositoryBundle(viewer.userId)
    const space = await resolveSpaceForViewer(repositories, viewer.userId, id)
    if (!space) {
      return NextResponse.json({ error: "Space not found or not accessible." }, { status: 404 })
    }

    const memory = await repositories.memory.listBySpace(id, {
      lifecycleStates: ["active", "cooling"],
      limit: 200,
    })
    return NextResponse.json({ memory })
  },
)

export const POST = withApiAuth(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await resolveViewer(request.headers.get("authorization"))
    requireViewerScope(viewer, "memory:write")
    if (viewer.mode === "mcp") {
      await consumeMcpWriteQuota(viewer.userId)
    } else if (viewer.mode === "extension") {
      await consumeExtensionMemoryWriteQuota(viewer.userId)
    }
    const { id } = await params
    const repositories = createRepositoryBundle(viewer.userId)
    const space = await resolveSpaceForViewer(repositories, viewer.userId, id)
    if (!space) {
      return NextResponse.json({ error: "Space not found or not accessible." }, { status: 404 })
    }

    const body = await request.json()
    // Personal spaces carry no projectId; project spaces still set it for
    // back-compat with the legacy project-scoped readers + RLS policies.
    const projectId = space.kind === "project" ? space.projectId : null
    const item = await createMemoryItem(viewer.userId, {
      ...body,
      spaceId: id,
      projectId,
    })
    return NextResponse.json({ item }, { status: 201 })
  },
)
