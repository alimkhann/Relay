import { z } from "zod"

import { supportedPlatforms } from "../constants/platforms"

const MAX_TURN_CONTENT_LENGTH = 120_000
const MAX_RAW_HTML_LENGTH = 250_000
const MAX_TURNS_PER_CAPTURE = 500

const relayInsertedContextMetadataSchema = z.object({
  kind: z.enum(["fresh_chat_bootstrap", "quick_continuity"]),
  packetId: z.string().nullable().optional(),
  insertedContentHash: z.string().min(1),
  deltaKind: z.enum(["unchanged", "appended", "edited", "assistant_only"]),
  rawTurnCount: z.number().int().nonnegative(),
  filteredTurnCount: z.number().int().nonnegative(),
  assistantOutcome: z.enum(["none", "dropped_ack", "dropped_overlap", "kept_novel"])
})

const parsedTurnSchema = z.object({
  role: z.enum(["user", "assistant", "system", "unknown"]),
  content: z.string().min(1).max(MAX_TURN_CONTENT_LENGTH),
  turnIndex: z.number().int().nonnegative(),
  rawHtml: z.string().max(MAX_RAW_HTML_LENGTH).nullable().optional()
})

export const capturePayloadSchema = z.object({
  projectId: z.string().min(1),
  platform: z.enum(supportedPlatforms),
  processingMode: z.enum(["default", "fast_ack"]).optional(),
  session: z.object({
    title: z.string().nullable().optional(),
    url: z.url(),
    tabId: z.string().nullable().optional(),
    windowId: z.string().nullable().optional(),
    pageFingerprint: z.string().nullable().optional(),
    captureSignature: z.string().nullable().optional(),
    sourceConversationId: z.string().max(500).nullable().optional(),
    metadata: z.object({
      relayInsertedContext: relayInsertedContextMetadataSchema.optional()
    }).catchall(z.unknown()).optional()
  }),
  turns: z.array(parsedTurnSchema).max(MAX_TURNS_PER_CAPTURE)
})
