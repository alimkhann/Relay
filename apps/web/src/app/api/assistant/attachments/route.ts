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
const MAX_ATTACHMENTS_PER_CHAT = 24
const MAX_ATTACHMENTS_PER_MESSAGE = 8

// Document MIMEs match the source-ingestion allowlist; image MIMEs cover what
// Gemini's vision input accepts. Anything else is refused at the boundary so
// the agent never sees an unreadable blob.
const DOCUMENT_MIME_ALLOWLIST = new Set<string>([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
])
const IMAGE_MIME_ALLOWLIST = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
])

function isAllowedMime(mime: string): boolean {
  return DOCUMENT_MIME_ALLOWLIST.has(mime) || IMAGE_MIME_ALLOWLIST.has(mime)
}

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

  if (!isAllowedMime(mime)) {
    // 415 Unsupported Media Type — keeps a runaway client from feeding the
    // agent arbitrary bytes (and matches what the source-upload path enforces).
    return NextResponse.json(
      { error: `Attachments of type "${mime}" are not supported.` },
      { status: 415 }
    )
  }

  // Per-chat cap so a runaway client cannot fill the agent's prompt budget
  // by uploading dozens of files into one conversation.
  const existing = await repositories.assistantAttachments.listByChat(chat.id)
  if (existing.length >= MAX_ATTACHMENTS_PER_CHAT) {
    return NextResponse.json(
      { error: `This chat already has the maximum of ${MAX_ATTACHMENTS_PER_CHAT} attachments.` },
      { status: 409 }
    )
  }
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
    void logServerEvent({
      level: "error",
      surface: "web-api",
      area: "assistant",
      event: "assistant.attachment_store_failed",
      message: "attachment blob upload failed",
      context: {
        userId: viewer.userId,
        mime,
        reason: error instanceof Error ? error.message : "unknown"
      }
    })
    return NextResponse.json(
      { error: "Relay could not store this attachment for preview or AI reading. Please try again." },
      { status: 503 }
    )
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
      savedToRelay: false,
      limits: {
        perMessage: MAX_ATTACHMENTS_PER_MESSAGE,
        perChat: MAX_ATTACHMENTS_PER_CHAT
      }
    },
    { status: 201 }
  )
})
