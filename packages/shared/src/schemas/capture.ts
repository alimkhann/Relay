import { z } from "zod"

import { supportedPlatforms } from "../constants/platforms"

const MAX_TURN_CONTENT_LENGTH = 12_000
const MAX_RAW_HTML_LENGTH = 40_000
const MAX_TURNS_PER_CAPTURE = 120

const parsedTurnSchema = z.object({
  role: z.enum(["user", "assistant", "system", "unknown"]),
  content: z.string().min(1).max(MAX_TURN_CONTENT_LENGTH),
  turnIndex: z.number().int().nonnegative(),
  rawHtml: z.string().max(MAX_RAW_HTML_LENGTH).nullable().optional()
})

export const capturePayloadSchema = z.object({
  projectId: z.string().min(1),
  platform: z.enum(supportedPlatforms),
  session: z.object({
    title: z.string().nullable().optional(),
    url: z.url(),
    tabId: z.string().nullable().optional(),
    windowId: z.string().nullable().optional(),
    pageFingerprint: z.string().nullable().optional(),
    captureSignature: z.string().nullable().optional(),
    sourceConversationId: z.string().max(500).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  }),
  turns: z.array(parsedTurnSchema).max(MAX_TURNS_PER_CAPTURE)
})
