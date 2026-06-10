import { createRepositoryBundle } from "@relay/db"
import type { ProjectSettingsDto, ProjectSettingsRow } from "@relay/shared"
import { projectSettingsSchema, updateProjectSettingsSchema } from "@relay/shared"

import { invalidateProjectCache } from "@/server/cache/invalidation"

const defaultProjectSettings: ProjectSettingsRow["settings"] = {
  autonomyMode: "standard",
  showTentativeUpdates: true,
  includeTentativeUpdatesInPackets: true,
  compactionMode: "standard",
}

function normalizeProjectSettings(
  input: Partial<ProjectSettingsRow["settings"]> | null | undefined,
): ProjectSettingsRow["settings"] {
  return projectSettingsSchema.parse({
    ...defaultProjectSettings,
    ...(input ?? {}),
  })
}

export async function getProjectSettings(userId: string, projectId: string): Promise<ProjectSettingsDto> {
  const repositories = createRepositoryBundle(userId)
  const row = await repositories.projectSettings.getByProject(projectId)
  return normalizeProjectSettings(row?.settings)
}

export async function updateProjectSettings(userId: string, projectId: string, input: unknown): Promise<ProjectSettingsDto> {
  const repositories = createRepositoryBundle(userId)
  const existing = await repositories.projectSettings.getByProject(projectId)
  const patch = updateProjectSettingsSchema.parse(input)
  const combined: Record<string, unknown> = {
    ...(existing?.settings ?? defaultProjectSettings),
    ...patch,
  }
  // A `null` on any override clears it → inherit the next level up.
  for (const key of [
    "autoCapture",
    "autoCapturePlatforms",
    "inlineChip",
    "inlineChipPlatforms",
  ] as const) {
    if (patch[key] === null) {
      delete combined[key]
    }
  }
  const merged = normalizeProjectSettings(combined as Partial<ProjectSettingsRow["settings"]>)
  const row = await repositories.projectSettings.upsert(projectId, merged)
  invalidateProjectCache(userId, projectId)
  return normalizeProjectSettings(row.settings)
}

export { defaultProjectSettings, normalizeProjectSettings }
