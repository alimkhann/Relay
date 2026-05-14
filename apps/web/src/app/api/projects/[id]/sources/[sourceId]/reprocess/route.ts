import { withApiAuth } from "@/server/http/api-route"
import { BadRequestError } from "@/server/http/errors"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) => {
  void request
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, sourceId } = await params
  void sourceId
  requireViewerProject(viewer, id, "memory:write")
  throw new BadRequestError("Source reprocessing requires the original encrypted object and will be enabled after the first upload flow is deployed.")
})
