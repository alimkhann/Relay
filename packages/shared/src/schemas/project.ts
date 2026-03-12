import { z } from "zod"

export const projectInputSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).optional(),
  description: z.string().max(240).nullable().optional()
})

export const updateProjectSchema = projectInputSchema.partial().extend({
  isArchived: z.boolean().optional()
})

export const projectStateOverrideSchema = z.object({
  projectOverviewOverride: z.string().max(500).nullable().optional(),
  currentObjectiveOverride: z.string().max(320).nullable().optional(),
  recentProgressOverride: z.string().max(500).nullable().optional(),
  hiddenDecisions: z.array(z.string().min(1)).max(32).optional(),
  hiddenConstraints: z.array(z.string().min(1)).max(32).optional(),
  hiddenOpenTasks: z.array(z.string().min(1)).max(32).optional()
})

export const sessionArchiveSchema = z.object({
  archived: z.boolean().default(true)
})
