import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import { withApiAuth } from "@/server/http/api-route"
import { runAfterResponse } from "@/server/http/after"
import { BadRequestError } from "@/server/http/errors"
import { rejectMcpViewer, requireViewerProject, resolveViewer } from "@/server/policies/viewer"
import {
  createSourceFromUpload,
  processUploadedSource
} from "@/server/services/source-service"
import { getDecryptedSourceObject } from "@/server/services/source-storage-service"

export const dynamic = "force-dynamic"

export const POST = withApiAuth(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await resolveViewer(request.headers.get("authorization"))
    rejectMcpViewer(viewer, "Ask Relay is not available to scoped MCP tokens.")

    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as { projectId?: string }
    if (!body.projectId) throw new BadRequestError("projectId is required.")
    requireViewerProject(viewer, body.projectId, "memory:write")

    const repositories = createRepositoryBundle(viewer.userId)
    const [attachment] = await repositories.assistantAttachments.listByIds([id], viewer.userId)
    if (!attachment) throw new BadRequestError("Attachment not found.")

    const objectId = attachment.storageKey.split("/").pop()?.replace(/\.[^.]+$/, "") ?? ""
    let buffer: Buffer
    try {
      buffer = await getDecryptedSourceObject({
        key: attachment.storageKey,
        crypto: { projectId: attachment.chatId, sourceId: objectId, versionId: "v1" }
      })
    } catch {
      throw new BadRequestError("The attachment file is no longer available.")
    }

    const { detail, processing } = await createSourceFromUpload(viewer.userId, {
      projectId: body.projectId,
      fileName: attachment.fileName,
      mimeType: attachment.mime || "text/plain",
      buffer
    })
    runAfterResponse(() => processUploadedSource(viewer.userId, processing))
    await repositories.assistantAttachments.markSaved(attachment.id).catch(() => {})

    return NextResponse.json(detail, { status: 202 })
  }
)
