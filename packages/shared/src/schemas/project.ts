import { z } from "zod"

export const projectInputSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).optional(),
  description: z.string().max(240).nullable().optional()
})

export const updateProjectSchema = projectInputSchema.partial()
