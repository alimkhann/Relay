import type { CapturePayload, SourceSessionRow } from "@relay/shared"

import { toSessionRow } from "../mappers/session-mapper"
import type { DatabaseProvider } from "../store/provider"

/** Raw result from grouped sessions query */
export interface GroupedSessionResult {
  conversationId: string
  platform: SourceSessionRow["platform"]
  title: string | null
  url: string
  captureCount: number
  totalTurns: number
  lastCapturedAt: string
  firstCapturedAt: string
  sessionIds: string[]
  allArchived: boolean
}

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
      `insert into source_sessions (project_id, platform, url, title, tab_id, window_id, page_fingerprint, capture_signature, source_conversation_id, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
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
        input.session.sourceConversationId ?? input.session.url,
        JSON.stringify(input.session.metadata ?? {})
      ]
    )

    return toSessionRow(rows[0] as Record<string, unknown>)
  }

  async getLatestComparable(projectId: string, platform: CapturePayload["platform"], url: string, pageFingerprint?: string | null): Promise<SourceSessionRow | null> {
    // Gap 2: Archived sessions participate in dedup — removing is_archived filter
    // prevents re-capture of content that was already saved then archived.
    // Gap 3: Primary comparable key is (project_id, platform, url). Page fingerprint
    // is used as a tiebreaker when multiple matches exist, not as a hard filter.
    const rows = await this.provider.query(
      `select *
       from source_sessions
       where project_id = $1
         and platform = $2
         and url = $3
       order by
         case when coalesce(page_fingerprint, '') = coalesce($4, '') then 0 else 1 end,
         captured_at desc
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

  /** Count distinct conversations (by URL) for a project — used for dashboard display. */
  async countDistinctConversations(
    projectId: string,
    input: { includeArchived?: boolean } = {}
  ): Promise<number> {
    const includeArchived = input.includeArchived ?? false
    const rows = await this.provider.query(
      `select count(distinct url) as count
       from source_sessions
       where project_id = $1
         and ($2::boolean or is_archived = false)`,
      [projectId, includeArchived]
    )

    return Number((rows[0] as Record<string, unknown>)?.count ?? 0)
  }

  /**
   * Get sessions grouped by conversation ID for activity compression.
   * Returns groups sorted by most recent capture, with capture counts and total turns.
   */
  async getGroupedSessions(
    projectId: string,
    input: { includeArchived?: boolean; limit?: number } = {}
  ): Promise<GroupedSessionResult[]> {
    const includeArchived = input.includeArchived ?? false
    const limit = input.limit ?? 20

    const rows = await this.provider.query(
      `with session_turns as (
         select s.id as session_id, count(t.id) as turn_count
         from source_sessions s
         left join source_turns t on t.session_id = s.id
         where s.project_id = $1
           and ($2::boolean or s.is_archived = false)
         group by s.id
       ),
       ranked_sessions as (
         select
           s.*,
           st.turn_count,
           row_number() over (
             partition by s.source_conversation_id
             order by s.captured_at desc
           ) as rn
         from source_sessions s
         join session_turns st on st.session_id = s.id
         where s.project_id = $1
           and ($2::boolean or s.is_archived = false)
       )
       select
         source_conversation_id as conversation_id,
         platform,
         max(case when rn = 1 then title end) as title,
         max(case when rn = 1 then url end) as url,
         count(*)::int as capture_count,
         sum(turn_count)::int as total_turns,
         max(captured_at) as last_captured_at,
         min(captured_at) as first_captured_at,
         array_agg(id order by captured_at desc) as session_ids,
         bool_and(is_archived) as all_archived
       from ranked_sessions
       group by source_conversation_id, platform
       order by max(captured_at) desc
       limit $3`,
      [projectId, includeArchived, limit]
    )

    return rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        conversationId: String(r.conversation_id ?? r.url),
        platform: r.platform as SourceSessionRow["platform"],
        title: r.title ? String(r.title) : null,
        url: String(r.url),
        captureCount: Number(r.capture_count),
        totalTurns: Number(r.total_turns),
        lastCapturedAt: String(r.last_captured_at),
        firstCapturedAt: String(r.first_captured_at),
        sessionIds: (r.session_ids as string[]) ?? [],
        allArchived: Boolean(r.all_archived)
      }
    })
  }
}
