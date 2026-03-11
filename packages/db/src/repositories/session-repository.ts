import type { CapturePayload, SourceSessionRow } from "@relay/shared"

import { toSessionRow } from "../mappers/session-mapper"
import type { DatabaseProvider } from "../store/provider"

export class SessionRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getById(id: string): Promise<SourceSessionRow | null> {
    const rows = await this.provider.query(
      `select *
       from source_sessions
       where id = $1
       limit 1`,
      [id]
    )

    const row = rows[0]
    return row ? toSessionRow(row as Record<string, unknown>) : null
  }

  async listByProject(projectId: string): Promise<SourceSessionRow[]> {
    const rows = await this.provider.query(
      `select *
       from source_sessions
       where project_id = $1
       order by captured_at desc`,
      [projectId]
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
       order by captured_at desc
       limit 1`,
      [projectId, platform, url, pageFingerprint ?? null]
    )

    const row = rows[0]
    return row ? toSessionRow(row as Record<string, unknown>) : null
  }
}
