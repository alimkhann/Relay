import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import { withApiAuth } from "@/server/http/api-route"
import { BadRequestError } from "@/server/http/errors"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { getDecryptedSourceObject } from "@/server/services/source-storage-service"

export const dynamic = "force-dynamic"

export const GET = withApiAuth(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const viewer = await resolveViewer(request.headers.get("authorization"))
    rejectMcpViewer(viewer, "Ask Relay is not available to scoped MCP tokens.")

    const { id } = await params
    const repositories = createRepositoryBundle(viewer.userId)
    const [attachment] = await repositories.assistantAttachments.listByIds([id], viewer.userId)
    if (!attachment) throw new BadRequestError("Attachment not found.")
    if (!attachment.mime.startsWith("image/")) {
      throw new BadRequestError("Only image attachment previews are supported.")
    }

    const objectId = attachment.storageKey.split("/").pop()?.replace(/\.[^.]+$/, "") ?? ""
    const buffer = await getDecryptedSourceObject({
      key: attachment.storageKey,
      crypto: { projectId: attachment.chatId, sourceId: objectId, versionId: "v1" }
    })

    const body = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer

    return new NextResponse(body, {
      headers: {
        "content-type": attachment.mime,
        "cache-control": "private, max-age=300",
        "content-length": String(buffer.byteLength)
      }
    })
  }
)
