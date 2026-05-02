import type { SurfaceSyncMarkRow, SyncSurface } from "@relay/shared"

import type { DatabaseProvider } from "../store/provider"

function toSurfaceSyncMarkRow(record: Record<string, unknown>): SurfaceSyncMarkRow {
  return {
    id: String(record.id),
    projectId: String(record.project_id),
    userId: String(record.user_id),
    surface: String(record.surface) as SyncSurface,
    lastSyncAt: new Date(record.last_sync_at as string).toISOString(),
    createdAt: new Date(record.created_at as string).toISOString(),
    updatedAt: new Date(record.updated_at as string).toISOString()
  }
}

export class SyncMarkRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getBySurface(projectId: string, userId: string, surface: SyncSurface): Promise<SurfaceSyncMarkRow | null> {
    const rows = await this.provider.query(
      `select *
       from surface_sync_marks
       where project_id = $1 and user_id = $2 and surface = $3
       limit 1`,
      [projectId, userId, surface]
    )

    const row = rows[0]
    return row ? toSurfaceSyncMarkRow(row as Record<string, unknown>) : null
  }

  async upsert(projectId: string, userId: string, surface: SyncSurface, lastSyncAt: string): Promise<SurfaceSyncMarkRow> {
    const rows = await this.provider.query(
      `insert into surface_sync_marks (project_id, user_id, surface, last_sync_at)
       values ($1, $2, $3, $4)
       on conflict (project_id, user_id, surface)
       do update set last_sync_at = excluded.last_sync_at, updated_at = now()
       returning *`,
      [projectId, userId, surface, lastSyncAt]
    )

    return toSurfaceSyncMarkRow(rows[0] as Record<string, unknown>)
  }
}
