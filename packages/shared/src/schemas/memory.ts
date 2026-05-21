import { z } from "zod"

/** Valid source surfaces where memory can be captured from */
export const sourceSurfaceSchema = z.enum([
  "chatgpt",
  "claude",
  "gemini",
  "grok",
  "perplexity",
  "deepseek",
  "codex",
  "mcp",
  "web",
  "api"
])

export const createMemoryItemSchema = z
  .object({
    projectId: z.string().min(1).nullable().optional(),
    spaceId: z.string().min(1).nullable().optional(),
    sourceTurnId: z.string().nullable().optional(),
    type: z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"]),
    title: z.string().max(120).nullable().optional(),
    content: z.string().min(1),
    pinned: z.boolean().optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    // Source provenance fields
    sourceSurface: sourceSurfaceSchema.nullable().optional(),
    sourceConversationId: z.string().nullable().optional(),
    sourceUrl: z.string().url().nullable().optional(),
    capturedAt: z.string().datetime().nullable().optional(),
    derivedFrom: z.array(z.string()).nullable().optional(),
    forgetAfter: z.string().datetime().nullable().optional(),
  })
  .refine(
    (input) => Boolean(input.projectId) || Boolean(input.spaceId),
    { message: "Either projectId or spaceId must be provided." },
  )

export const lifecycleStateSchema = z.enum(["active", "cooling", "archived", "forgotten"])

export const updateMemoryItemSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  content: z.string().min(1).optional(),
  type: z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"]).optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  isArchived: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sourceConversationId: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  capturedAt: z.string().datetime().nullable().optional(),
  derivedFrom: z.array(z.string()).nullable().optional(),
  forgetAfter: z.string().datetime().nullable().optional(),
  // Memory v2 lifecycle controls
  lifecycleState: lifecycleStateSchema.optional(),
  validUntil: z.string().datetime().nullable().optional(),
  lastReaffirmedAt: z.string().datetime().nullable().optional(),
  /**
   * Required when lifecycleState === 'forgotten'. The route handler nulls
   * `content` and refuses the call without this flag.
   */
  confirm: z.boolean().optional()
})
