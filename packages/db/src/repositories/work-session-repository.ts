import type { WorkSessionRow } from "@relay/shared"

import { toWorkSessionRow } from "../mappers/work-session-mapper"
import type { DatabaseProvider } from "../store/provider"

export class WorkSessionRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    projectId: string
    userId: string
    workspaceId?: string | null
    surface: WorkSessionRow["surface"]
    threadId?: string | null
    agentName?: string | null
    clientName?: string | null
    associationMethod?: string | null
    associationConfidence?: number | null
    baseSyncMarkAt?: string | null
  }): Promise<WorkSessionRow> {
    const rows = await this.provider.query(
      `insert into work_sessions (
         project_id,
         user_id,
         workspace_id,
         surface,
         thread_id,
         agent_name,
         client_name,
         association_method,
         association_confidence,
         base_sync_mark_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [
        input.projectId,
        input.userId,
        input.workspaceId ?? null,
        input.surface,
        input.threadId ?? null,
        input.agentName ?? null,
        input.clientName ?? null,
        input.associationMethod ?? null,
        input.associationConfidence ?? null,
        input.baseSyncMarkAt ?? null,
      ],
    )

    return toWorkSessionRow(rows[0] as Record<string, unknown>)
  }

  async getById(id: string): Promise<WorkSessionRow | null> {
    const rows = await this.provider.query(
      `select * from work_sessions where id = $1 limit 1`,
      [id],
    )
    const row = rows[0]
    return row ? toWorkSessionRow(row as Record<string, unknown>) : null
  }

  async findReusableActiveSession(input: {
    projectId: string
    surface: WorkSessionRow["surface"]
    workspaceId?: string | null
    threadId?: string | null
    clientName?: string | null
    updatedSince?: string | null
  }): Promise<WorkSessionRow | null> {
    const rows = await this.provider.query(
      `select *
       from work_sessions
        where project_id = $1
          and surface = $2
          and status = 'active'
          and ($3::text is null or workspace_id = $3)
          and ($4::text is null or thread_id = $4)
          and ($5::text is null or client_name = $5)
          and ($6::timestamptz is null or updated_at >= $6::timestamptz)
        order by updated_at desc
        limit 1`,
      [
        input.projectId,
        input.surface,
        input.workspaceId ?? null,
        input.threadId ?? null,
        input.clientName ?? null,
        input.updatedSince ?? null,
      ],
    )

    const row = rows[0]
    return row ? toWorkSessionRow(row as Record<string, unknown>) : null
  }

  async touch(id: string): Promise<void> {
    await this.provider.query(
      `update work_sessions set updated_at = now() where id = $1`,
      [id],
    )
  }

  async updateLatestState(input: {
    id: string
    latestSummary?: string | null
    latestStructuredState?: Record<string, unknown>
    status?: WorkSessionRow["status"]
    endedAt?: string | null
  }): Promise<WorkSessionRow> {
    const rows = await this.provider.query(
      `update work_sessions
       set latest_summary = coalesce($2, latest_summary),
           latest_structured_state = coalesce($3::jsonb, latest_structured_state),
           status = coalesce($4, status),
           ended_at = case when $5::timestamptz is not null then $5::timestamptz else ended_at end,
           updated_at = now()
       where id = $1
       returning *`,
      [
        input.id,
        input.latestSummary ?? null,
        input.latestStructuredState ? JSON.stringify(input.latestStructuredState) : null,
        input.status ?? null,
        input.endedAt ?? null,
      ],
    )

    const row = rows[0]
    if (!row) throw new Error("Work session not found")
    return toWorkSessionRow(row as Record<string, unknown>)
  }

  async markStaleOlderThan(input: {
    projectId: string
    surface: WorkSessionRow["surface"]
    olderThan: string
    workspaceId?: string | null
    threadId?: string | null
    clientName?: string | null
  }): Promise<number> {
    const rows = await this.provider.query(
      `update work_sessions
       set status = 'stale',
           ended_at = coalesce(ended_at, now()),
           updated_at = now()
       where project_id = $1
         and surface = $2
         and status = 'active'
         and updated_at < $3::timestamptz
         and ($4::text is null or workspace_id = $4)
         and ($5::text is null or thread_id = $5)
         and ($6::text is null or client_name = $6)
       returning id`,
      [
        input.projectId,
        input.surface,
        input.olderThan,
        input.workspaceId ?? null,
        input.threadId ?? null,
        input.clientName ?? null,
      ],
    )
    return rows.length
  }

  async promoteThreadId(input: {
    projectId: string
    surface: WorkSessionRow["surface"]
    provisionalThreadId: string
    canonicalThreadId: string
    clientName?: string | null
  }): Promise<void> {
    await this.provider.query(
      `update work_sessions
       set thread_id = $4,
           association_method = 'promoted_thread',
           association_confidence = greatest(coalesce(association_confidence, 0), 0.99),
           updated_at = now()
       where project_id = $1
         and surface = $2
         and thread_id = $3
         and ($5::text is null or client_name = $5)`,
      [
        input.projectId,
        input.surface,
        input.provisionalThreadId,
        input.canonicalThreadId,
        input.clientName ?? null,
      ],
    )
  }
}
