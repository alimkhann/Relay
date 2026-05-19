import { randomUUID } from "node:crypto"

import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import { withApiAuth } from "@/server/http/api-route"
import { BadRequestError } from "@/server/http/errors"
import { logServerEvent } from "@/server/logging/logger"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { extractTextFromSourceBuffer } from "@/server/services/source-ingestion-service"
import {
  buildAssistantObjectKey,
  putEncryptedSourceObject
} from "@/server/services/source-storage-service"

export const dynamic = "force-dynamic"

const MAX_BYTES = 15 * 1024 * 1024

function extensionOf(fileName: string, mime: string) {
  const fromName = fileName.includes(".") ? fileName.split(".").pop() ?? "" : ""
  if (fromName) return fromName
  if (mime.startsWith("image/")) return mime.slice(6)
  return "bin"
}

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer, "Ask Relay is not available to scoped MCP tokens.")

  const formData = await request.formData()
  const chatId = formData.get("chatId")
  const file = formData.get("file")
  if (typeof chatId !== "string" || !chatId) {
    throw new BadRequestError("chatId is required.")
  }
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    throw new BadRequestError("A file is required.")
  }

  const upload = file as File
  const buffer = Buffer.from(await upload.arrayBuffer())
  if (buffer.byteLength === 0) throw new BadRequestError("The file is empty.")
  if (buffer.byteLength > MAX_BYTES) {
    throw new BadRequestError("Attachments must be 15 MB or smaller.")
  }

  const repositories = createRepositoryBundle(viewer.userId)
  const chat = await repositories.assistantChats.getById(chatId)
  if (!chat || chat.userId !== viewer.userId) {
    throw new BadRequestError("Chat not found.")
  }

  const fileName = upload.name || "attachment"
  const mime = upload.type || "application/octet-stream"

  // Documents → extracted text folded into the prompt. Images keep no text and
  // are sent to the model as inline vision parts at turn time.
  let extractedText: string | null = null
  if (!mime.startsWith("image/")) {
    try {
      const extracted = await extractTextFromSourceBuffer({ buffer, fileName, mimeType: mime })
      extractedText = extracted.text || null
    } catch {
      extractedText = null
    }
  }

  const objectId = randomUUID()
  const storageKey = buildAssistantObjectKey({
    userId: viewer.userId,
    chatId: chat.id,
    attachmentId: objectId,
    extension: extensionOf(fileName, mime)
  })

  try {
    await putEncryptedSourceObject({
      key: storageKey,
      buffer,
      contentType: mime,
      crypto: { projectId: chat.id, sourceId: objectId, versionId: "v1" }
    })
  } catch (error) {
    // Storage unconfigured (local/memory mode): still persist the row + text so
    // document context works; only image vision needs the blob. Logged so a
    // misconfigured R2 in prod is visible instead of silently dropping images.
    void logServerEvent({
      level: "warn",
      surface: "web-api",
      area: "assistant",
      event: "assistant.attachment_store_failed",
      message: "attachment blob upload failed; row persisted without blob",
      context: {
        userId: viewer.userId,
        mime,
        reason: error instanceof Error ? error.message : "unknown"
      }
    })
  }

  const row = await repositories.assistantAttachments.create({
    chatId: chat.id,
    userId: viewer.userId,
    fileName,
    mime,
    byteSize: buffer.byteLength,
    storageKey,
    extractedText
  })

  return NextResponse.json(
    {
      id: row.id,
      fileName: row.fileName,
      mime: row.mime,
      byteSize: row.byteSize,
      hasText: Boolean(extractedText),
      savedToRelay: false
    },
    { status: 201 }
  )
})
