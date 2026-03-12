import type { CapturePayload, SourceSessionRow } from "@relay/shared"

import { toSessionRow } from "../mappers/session-mapper"
import type { DatabaseProvider } from "../store/provider"

export class SessionRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getById(id: string, input: { includeArchived?: boolean } = {}): Promise<SourceSessionRow | null> {
    const includeArchived = input.includeArchived ?? true
    const rows = await this.provider.query(
      `select *
       from source_sessions
       where id = $1
         and ($2::boolean or is_archived = false)
       limit 1`,
      [id, includeArchived]
    )

    const row = rows[0]
    return row ? toSessionRow(row as Record<string, unknown>) : null
  }

  async listByProject(
    projectId: string,
    input: { includeArchived?: boolean; limit?: number } = {}
  ): Promise<SourceSessionRow[]> {
    const includeArchived = input.includeArchived ?? false
    const limit = input.limit ?? 50
    const rows = await this.provider.query(
      `select *
       from source_sessions
       where project_id = $1
         and ($2::boolean or is_archived = false)
       order by captured_at desc
       limit $3`,
      [projectId, includeArchived, limit]
    )

    return rows.map((record) => toSessionRow(record as Record<string, unknown>))
  }

  async create(input: CapturePayload): Promise<SourceSessionRow> {
    const rows = await this.provider.query(
      `insert into source_sessions (project_id, platform, url, title, tab_id, window_id, page_fingerprint, capture_signature, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       returning *`,
      [
        input.projectId,
        input.platform,
        input.session.url,
        input.session.title ?? null,
        input.session.tabId ?? null,
        input.session.windowId ?? null,
        input.session.pageFingerprint ?? null,
        input.session.captureSignature ?? null,
        JSON.stringify(input.session.metadata ?? {})
      ]
    )

    return toSessionRow(rows[0] as Record<string, unknown>)
  }

  async getLatestComparable(projectId: string, platform: CapturePayload["platform"], url: string, pageFingerprint?: string | null): Promise<SourceSessionRow | null> {
    const rows = await this.provider.query(
      `select *
       from source_sessions
       where project_id = $1
         and platform = $2
         and url = $3
         and coalesce(page_fingerprint, '') = coalesce($4, '')
         and is_archived = false
       order by captured_at desc
       limit 1`,
      [projectId, platform, url, pageFingerprint ?? null]
    )

    const row = rows[0]
    return row ? toSessionRow(row as Record<string, unknown>) : null
  }

  async archive(id: string, archivedBy: string, archived = true): Promise<SourceSessionRow | null> {
    const rows = await this.provider.query(
      `update source_sessions
       set is_archived = $2,
           archived_at = case when $2 then now() else null end,
           archived_by = case when $2 then $3 else null end
       where id = $1
       returning *`,
      [id, archived, archivedBy]
    )

    const row = rows[0]
    return row ? toSessionRow(row as Record<string, unknown>) : null
  }
}
