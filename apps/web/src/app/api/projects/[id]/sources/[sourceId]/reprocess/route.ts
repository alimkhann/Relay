import { createRepositoryBundle } from "@relay/db"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeExternalSourceMcpActionQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { refreshExternalSource, reprocessUploadedSource } from "@/server/services/source-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, sourceId } = await params
  requireViewerProject(viewer, id, "memory:write")
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
    await consumeExternalSourceMcpActionQuota(viewer.userId)
  }
  const source = await createRepositoryBundle(viewer.userId).sources.getById(sourceId)
  const detail = source?.kind === "uploaded_file"
    ? await reprocessUploadedSource(viewer.userId, id, sourceId)
    : await refreshExternalSource(viewer.userId, id, sourceId)
  return Response.json(detail)
})
