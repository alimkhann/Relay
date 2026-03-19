import { z } from "zod"

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
  summary: z.string().nullable().optional(),
  progress: z.string().nullable().optional(),
  currentObjective: z.string().nullable().optional(),
  decisions: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  relevantTools: z.array(z.string()).optional(),
  touchedFiles: z.array(z.string()).optional(),
  reaffirmedFacts: z.array(z.string()).optional(),
})

export const workSessionOpenSchema = z.object({
  surface: workSessionSurfaceSchema,
  workspaceId: z.string().optional(),
  threadId: z.string().optional(),
  agentName: z.string().optional(),
  clientName: z.string().optional(),
  associationMethod: z.string().optional(),
  associationConfidence: z.number().min(0).max(1).optional(),
})

export const workSessionCheckpointSchema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.string().optional(),
  eventPayload: z.record(z.string(), z.unknown()).optional(),
  summaryShort: z.string().optional(),
  structuredState: workSessionStructuredStateSchema,
  confidence: z.number().min(0).max(1).optional(),
})

export const workSessionCloseSchema = z.object({
  sessionId: z.string().uuid(),
  summaryShort: z.string().optional(),
  structuredState: workSessionStructuredStateSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
})
