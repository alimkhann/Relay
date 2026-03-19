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

export const createMemoryItemSchema = z.object({
  projectId: z.string().min(1),
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
  derivedFrom: z.array(z.string()).nullable().optional()
})

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
  derivedFrom: z.array(z.string()).nullable().optional()
})
