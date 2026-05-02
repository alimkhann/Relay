import { createRepositoryBundle } from "@relay/db"
import type { ProjectSettingsDto, ProjectSettingsRow } from "@relay/shared"
import { projectSettingsSchema, updateProjectSettingsSchema } from "@relay/shared"

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
  const merged = normalizeProjectSettings({
    ...(existing?.settings ?? defaultProjectSettings),
    ...patch,
  })
  const row = await repositories.projectSettings.upsert(projectId, merged)
  return normalizeProjectSettings(row.settings)
}

export { defaultProjectSettings, normalizeProjectSettings }
