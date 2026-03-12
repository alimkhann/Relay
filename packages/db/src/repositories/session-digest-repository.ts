import type { SessionDigestRow } from "@relay/shared"

import { toSessionDigestRow } from "../mappers/relay-v2-mapper"
import type { DatabaseProvider } from "../store/provider"

export class SessionDigestRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByProject(projectId: string, limit = 10, input: { includeArchived?: boolean; ascending?: boolean } = {}): Promise<SessionDigestRow[]> {
    const includeArchived = input.includeArchived ?? false
    const direction = input.ascending ? "asc" : "desc"
    const rows = await this.provider.query(
      `select *
       from session_digests
       where project_id = $1
         and ($3::boolean or exists (
           select 1
           from source_sessions
           where source_sessions.id = session_digests.source_session_id
             and source_sessions.is_archived = false
         ))
       order by created_at ${direction}
       limit $2`,
      [projectId, limit, includeArchived]
    )

    return rows.map((record) => toSessionDigestRow(record as Record<string, unknown>))
  }

  async getBySessionId(sessionId: string, input: { includeArchived?: boolean } = {}): Promise<SessionDigestRow | null> {
    const includeArchived = input.includeArchived ?? true
    const rows = await this.provider.query(
      `select *
       from session_digests
       where source_session_id = $1
         and ($2::boolean or exists (
           select 1
           from source_sessions
           where source_sessions.id = session_digests.source_session_id
             and source_sessions.is_archived = false
         ))
       limit 1`,
      [sessionId, includeArchived]
    )

    const row = rows[0]
    return row ? toSessionDigestRow(row as Record<string, unknown>) : null
  }

  async create(input: {
    projectId: string
    sourceSessionId: string
    sourceSignature: string
    summaryShort: string
    structuredDigest: Record<string, unknown>
    confidence: number
    importanceScore: number
    needsProjectStateMerge: boolean
    createdBy: string
  }): Promise<SessionDigestRow> {
    const rows = await this.provider.query(
      `insert into session_digests (
         project_id,
         source_session_id,
         source_signature,
         summary_short,
         structured_digest,
         confidence,
         importance_score,
         needs_project_state_merge,
         created_by
       )
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       on conflict (source_session_id) do update
         set source_signature = excluded.source_signature,
             summary_short = excluded.summary_short,
             structured_digest = excluded.structured_digest,
             confidence = excluded.confidence,
             importance_score = excluded.importance_score,
             needs_project_state_merge = excluded.needs_project_state_merge
       returning *`,
      [
        input.projectId,
        input.sourceSessionId,
        input.sourceSignature,
        input.summaryShort,
        JSON.stringify(input.structuredDigest),
        input.confidence,
        input.importanceScore,
        input.needsProjectStateMerge,
        input.createdBy
      ]
    )

    return toSessionDigestRow(rows[0] as Record<string, unknown>)
  }

  async markMerged(id: string): Promise<void> {
    await this.provider.query(
      `update session_digests
       set merged_at = now()
       where id = $1`,
      [id]
    )
  }
}
