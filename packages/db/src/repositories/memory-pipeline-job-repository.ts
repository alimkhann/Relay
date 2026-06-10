import type { DatabaseProvider } from "../store/provider"

export type MemoryPipelineJobType = "enrich_memory_item" | "regenerate_personal_state"
export type MemoryPipelineJobStatus = "pending" | "running" | "done" | "failed"

export interface MemoryPipelineJobRow {
  id: string
  jobType: MemoryPipelineJobType
  dedupeKey: string
  userId: string | null
  projectId: string | null
  memoryItemId: string | null
  payload: Record<string, unknown>
  status: MemoryPipelineJobStatus
  runAfter: string
  attempts: number
  lockedAt: string | null
  lockedBy: string | null
  lastError: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

function toJobRow(row: Record<string, unknown>): MemoryPipelineJobRow {
  return {
    id: String(row.id),
    jobType: String(row.job_type) as MemoryPipelineJobType,
    dedupeKey: String(row.dedupe_key),
    userId: row.user_id ? String(row.user_id) : null,
    projectId: row.project_id ? String(row.project_id) : null,
    memoryItemId: row.memory_item_id ? String(row.memory_item_id) : null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: String(row.status) as MemoryPipelineJobStatus,
    runAfter: String(row.run_after),
    attempts: Number(row.attempts ?? 0),
    lockedAt: row.locked_at ? String(row.locked_at) : null,
    lockedBy: row.locked_by ? String(row.locked_by) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export class MemoryPipelineJobRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async enqueue(input: {
    jobType: MemoryPipelineJobType
    dedupeKey: string
    userId?: string | null
    projectId?: string | null
    memoryItemId?: string | null
    payload?: Record<string, unknown>
    runAfter?: Date | string | null
  }): Promise<MemoryPipelineJobRow> {
    const rows = await this.provider.query(
      `insert into memory_pipeline_jobs
        (job_type, dedupe_key, user_id, project_id, memory_item_id, payload, run_after)
       values ($1, $2, $3, $4, $5, $6::jsonb, coalesce($7::timestamptz, now()))
       on conflict (dedupe_key) where status in ('pending','running','failed')
       do update set
         run_after = case
           when excluded.job_type = 'regenerate_personal_state'
             then greatest(memory_pipeline_jobs.run_after, excluded.run_after)
           else least(memory_pipeline_jobs.run_after, excluded.run_after)
         end,
         status = case
           when memory_pipeline_jobs.status = 'failed' then 'pending'
           else memory_pipeline_jobs.status
         end,
         payload = memory_pipeline_jobs.payload || excluded.payload,
         last_error = null,
         updated_at = now()
       returning *`,
      [
        input.jobType,
        input.dedupeKey,
        input.userId ?? null,
        input.projectId ?? null,
        input.memoryItemId ?? null,
        JSON.stringify(input.payload ?? {}),
        input.runAfter ? new Date(input.runAfter).toISOString() : null,
      ],
    )
    return toJobRow(rows[0] as Record<string, unknown>)
  }

  async claimDue(input: {
    limit: number
    lockedBy: string
  }): Promise<MemoryPipelineJobRow[]> {
    const limit = Math.min(Math.max(input.limit, 1), 100)
    const rows = await this.provider.query(
      `with picked as (
         select id
         from memory_pipeline_jobs
         where status in ('pending','failed')
           and run_after <= now()
         order by run_after asc, created_at asc
         limit $1
         for update skip locked
       )
       update memory_pipeline_jobs j
       set status = 'running',
           attempts = attempts + 1,
           locked_at = now(),
           locked_by = $2,
           updated_at = now()
       from picked
       where j.id = picked.id
       returning j.*`,
      [limit, input.lockedBy],
    )
    return rows.map((row) => toJobRow(row as Record<string, unknown>))
  }

  async complete(id: string): Promise<void> {
    await this.provider.query(
      `update memory_pipeline_jobs
       set status = 'done',
           completed_at = now(),
           locked_at = null,
           locked_by = null,
           last_error = null,
           updated_at = now()
       where id = $1`,
      [id],
    )
  }

  async fail(id: string, error: string, retryAfterMs = 5 * 60 * 1000): Promise<void> {
    await this.provider.query(
      `update memory_pipeline_jobs
       set status = 'failed',
           run_after = now() + ($2::int * interval '1 millisecond'),
           locked_at = null,
           locked_by = null,
           last_error = $3,
           updated_at = now()
       where id = $1`,
      [id, retryAfterMs, error.slice(0, 1000)],
    )
  }

  async countPending(): Promise<number> {
    const rows = await this.provider.query(
      `select count(*)::int as count
       from memory_pipeline_jobs
       where status in ('pending','failed')
         and run_after <= now()`,
    )
    return Number((rows[0] as Record<string, unknown> | undefined)?.count ?? 0)
  }
}
