import type { CapturePayload, SourceSessionRow } from "@relay/shared"

import { toSessionRow } from "../mappers/session-mapper"
import type { DatabaseProvider } from "../store/provider"

export class SessionRepository {
  constructor(private readonly provider: DatabaseProvider) {}

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
      `insert into source_sessions (project_id, platform, url, title, tab_id, window_id, page_fingerprint, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       returning *`,
      [
        input.projectId,
        input.platform,
        input.session.url,
        input.session.title ?? null,
        input.session.tabId ?? null,
        input.session.windowId ?? null,
        input.session.pageFingerprint ?? null,
        JSON.stringify(input.session.metadata ?? {})
      ]
    )

    return toSessionRow(rows[0] as Record<string, unknown>)
  }
}
