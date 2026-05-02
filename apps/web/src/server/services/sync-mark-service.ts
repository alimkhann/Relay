import { createRepositoryBundle } from "@relay/db"
import type { SyncSurface } from "@relay/shared"

export async function recordSyncMarkForUser(
  userId: string,
  projectId: string,
  surface: SyncSurface,
  lastSyncAt = new Date().toISOString()
) {
  const repositories = createRepositoryBundle(userId)
  return repositories.syncMarks.upsert(projectId, userId, surface, lastSyncAt)
}

export async function getSyncMarkForUser(userId: string, projectId: string, surface: SyncSurface) {
  const repositories = createRepositoryBundle(userId)
  return repositories.syncMarks.getBySurface(projectId, userId, surface)
}
