import { z } from "zod"

const MAX_WORK_SESSION_TEXT_LENGTH = 2_000
const MAX_WORK_SESSION_LIST_ITEMS = 20
const MAX_WORK_SESSION_LIST_ITEM_LENGTH = 500

const boundedTextSchema = z.string().max(MAX_WORK_SESSION_TEXT_LENGTH)
const boundedListItemSchema = z.string().max(MAX_WORK_SESSION_LIST_ITEM_LENGTH)
const boundedListSchema = z.array(boundedListItemSchema).max(MAX_WORK_SESSION_LIST_ITEMS)

export const workSessionSurfaceSchema = z.enum([
  "mcp",
  "cli",
  "chatgpt",
  "claude",
  "codex",
  "opencode",
  "gemini",
  "cursor",
  "warp",
  "windsurf",
  "antigravity",
  "grok",
  "perplexity",
  "deepseek",
  "web",
  "api",
])

export const workSessionStructuredStateSchema = z.object({
  summary: boundedTextSchema.nullable().optional(),
  progress: boundedTextSchema.nullable().optional(),
  currentObjective: boundedTextSchema.nullable().optional(),
  decisions: boundedListSchema.optional(),
  constraints: boundedListSchema.optional(),
  nextSteps: boundedListSchema.optional(),
  notes: boundedListSchema.optional(),
  relevantTools: boundedListSchema.optional(),
  touchedFiles: boundedListSchema.optional(),
  reaffirmedFacts: boundedListSchema.optional(),
})

export const workSessionOpenSchema = z.object({
  surface: workSessionSurfaceSchema,
  workspaceId: z.string().max(300).optional(),
  threadId: z.string().max(500).optional(),
  agentName: z.string().max(200).optional(),
  clientName: z.string().max(200).optional(),
  associationMethod: z.string().max(100).optional(),
  associationConfidence: z.number().min(0).max(1).optional(),
})

export const workSessionCheckpointSchema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.string().max(100).optional(),
  eventPayload: z.record(z.string(), z.unknown()).optional(),
  summaryShort: boundedTextSchema.optional(),
  structuredState: workSessionStructuredStateSchema,
  confidence: z.number().min(0).max(1).optional(),
})

export const workSessionCloseSchema = z.object({
  sessionId: z.string().uuid(),
  summaryShort: boundedTextSchema.optional(),
  structuredState: workSessionStructuredStateSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
})
