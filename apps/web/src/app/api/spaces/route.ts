import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"
import { withApiAuth } from "@/server/http/api-route"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { requireViewerScope, resolveViewer } from "@/server/policies/viewer"

/**
 * GET /api/spaces — list spaces the viewer can write to.
 *
 * Returns the personal space first, then project spaces in recent-activity
 * order. Used by the extension picker and the personal/projects switcher to
 * route captures to /api/spaces/[id]/memory (personal) or the legacy
 * /api/projects/[id]/memory (project) endpoint.
 */
export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  requireViewerScope(viewer, "memory:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }

  const repositories = createRepositoryBundle(viewer.userId)

  // Lazy-create the personal space so the picker always has it on first load
  // even for users who never opened /personal.
  await repositories.spaces.ensurePersonalSpaceForUser(viewer.userId)

  const spaces = await repositories.spaces.listSpacesForUser(viewer.userId)

  return NextResponse.json({
    spaces: spaces.map((space) => ({
      id: space.id,
      kind: space.kind,
      name: space.name,
      projectId: space.projectId,
    })),
  })
})
