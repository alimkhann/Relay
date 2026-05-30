import { z } from "zod"

import { supportedPlatforms } from "../constants/platforms"

const platformBoolMapSchema = z.record(z.enum(supportedPlatforms), z.boolean())

export const projectUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch {
      return false
    }
  }, "Project URL must start with http:// or https://")

export const projectInputSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).optional(),
  description: z.string().max(200).nullable().optional(),
  projectUrl: projectUrlSchema.nullable().optional()
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

export const projectSettingsSchema = z.object({
  autonomyMode: z.enum(["conservative", "standard", "aggressive"]).default("standard"),
  showTentativeUpdates: z.boolean().default(true),
  includeTentativeUpdatesInPackets: z.boolean().default(true),
  compactionMode: z.enum(["light", "standard", "aggressive"]).default("standard"),
  // Per-project auto-capture override. Absent = inherit the global user
  // setting; true/false = force on/off for this project (incl. personal).
  autoCapture: z.boolean().optional(),
  // Per-(platform) overrides; a present leaf wins over the project-level value.
  autoCapturePlatforms: platformBoolMapSchema.optional(),
  // Per-project inline-chip override; absent = inherit `showSidepanelOnSupportedSites`.
  inlineChip: z.boolean().optional(),
  inlineChipPlatforms: platformBoolMapSchema.optional(),
})

// PATCH additionally accepts `null` on each override to clear it and fall back
// to the next level up (platform leaf → project → global).
export const updateProjectSettingsSchema = projectSettingsSchema
  .partial()
  .extend({
    autoCapture: z.boolean().nullable().optional(),
    autoCapturePlatforms: platformBoolMapSchema.nullable().optional(),
    inlineChip: z.boolean().nullable().optional(),
    inlineChipPlatforms: platformBoolMapSchema.nullable().optional(),
  })

export type ProjectSettingsInput = z.infer<typeof projectSettingsSchema>
export type UpdateProjectSettingsInput = z.infer<typeof updateProjectSettingsSchema>
