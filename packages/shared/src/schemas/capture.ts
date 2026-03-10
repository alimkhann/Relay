import { z } from "zod"

const parsedTurnSchema = z.object({
  role: z.enum(["user", "assistant", "system", "unknown"]),
  content: z.string().min(1),
  turnIndex: z.number().int().nonnegative(),
  rawHtml: z.string().nullable().optional()
})

export const capturePayloadSchema = z.object({
  projectId: z.string().min(1),
  platform: z.enum(["chatgpt", "perplexity", "claude"]),
  session: z.object({
    title: z.string().nullable().optional(),
    url: z.url(),
    tabId: z.string().nullable().optional(),
    windowId: z.string().nullable().optional(),
    pageFingerprint: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  }),
  turns: z.array(parsedTurnSchema)
})
