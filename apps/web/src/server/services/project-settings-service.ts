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
  // `autoCapture: null` clears the override → inherit the global user setting.
  if (patch.autoCapture === null) {
    delete combined.autoCapture
  }
  const merged = normalizeProjectSettings(combined as Partial<ProjectSettingsRow["settings"]>)
  const row = await repositories.projectSettings.upsert(projectId, merged)
  invalidateProjectCache(userId, projectId)
  return normalizeProjectSettings(row.settings)
}

export { defaultProjectSettings, normalizeProjectSettings }
