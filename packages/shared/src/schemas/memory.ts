import { z } from "zod"

export const createMemoryItemSchema = z.object({
  projectId: z.string().min(1),
  sourceTurnId: z.string().nullable().optional(),
  type: z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"]),
  title: z.string().max(120).nullable().optional(),
  content: z.string().min(1),
  pinned: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

export const updateMemoryItemSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  content: z.string().min(1).optional(),
  type: z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"]).optional(),
  pinned: z.boolean().optional(),
  isArchived: z.boolean().optional()
})
