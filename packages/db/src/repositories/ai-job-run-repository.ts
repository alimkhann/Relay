import type { AiJobRunRow } from "@relay/shared"

import { toAiJobRunRow } from "../mappers/relay-v2-mapper"
import type { DatabaseProvider } from "../store/provider"

export class AiJobRunRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async create(input: {
    projectId: string
    sessionId: string | null
    createdBy: string
    jobKind: AiJobRunRow["jobKind"]
    status?: AiJobRunRow["status"]
    inputPayload: Record<string, unknown>
    outputPayload?: Record<string, unknown>
    primaryModel?: string | null
  }): Promise<AiJobRunRow> {
    const rows = await this.provider.query(
      `insert into ai_job_runs (project_id, session_id, created_by, job_kind, status, input_payload, output_payload, primary_model)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       returning *`,
      [
        input.projectId,
        input.sessionId,
        input.createdBy,
        input.jobKind,
        input.status ?? "pending",
        JSON.stringify(input.inputPayload),
        JSON.stringify(input.outputPayload ?? {}),
        input.primaryModel ?? null
      ]
    )

    return toAiJobRunRow(rows[0] as Record<string, unknown>)
  }

  async listPending(limit = 10): Promise<AiJobRunRow[]> {
    const rows = await this.provider.query(
      `select *
       from ai_job_runs
       where status = 'pending'
       order by created_at asc
       limit $1`,
      [limit]
    )

    return rows.map((record) => toAiJobRunRow(record as Record<string, unknown>))
  }

  async listByStatuses(statuses: AiJobRunRow["status"][], limit = 10, jobKind?: AiJobRunRow["jobKind"]): Promise<AiJobRunRow[]> {
    const values: Array<string | number | string[]> = [statuses]
    let clause = "status = any($1::text[])"

    if (jobKind) {
      values.push(jobKind)
      clause += ` and job_kind = $${values.length}`
    }

    values.push(limit)
    const rows = await this.provider.query(
      `select *
       from ai_job_runs
       where ${clause}
       order by created_at asc
       limit $${values.length}`,
      values
    )

    return rows.map((record) => toAiJobRunRow(record as Record<string, unknown>))
  }

  async listByProject(
    projectId: string,
    input: {
      limit?: number
      jobKind?: AiJobRunRow["jobKind"]
      statuses?: AiJobRunRow["status"][]
    } = {}
  ): Promise<AiJobRunRow[]> {
    const clauses = ["project_id = $1"]
    const values: Array<string | number | string[]> = [projectId]

    if (input.jobKind) {
      clauses.push(`job_kind = $${values.length + 1}`)
      values.push(input.jobKind)
    }

    if (input.statuses?.length) {
      clauses.push(`status = any($${values.length + 1}::text[])`)
      values.push(input.statuses)
    }

    const limit = input.limit ?? 20
    values.push(limit)

    const rows = await this.provider.query(
      `select *
       from ai_job_runs
       where ${clauses.join(" and ")}
       order by created_at desc
       limit $${values.length}`,
      values
    )

    return rows.map((record) => toAiJobRunRow(record as Record<string, unknown>))
  }

  async markTimedOutOlderThan(jobKind: AiJobRunRow["jobKind"], olderThanMinutes: number): Promise<AiJobRunRow[]> {
    const rows = await this.provider.query(
      `update ai_job_runs
       set status = 'timed_out',
           error_class = 'JobTimeout',
           error_message = 'Relay marked this job as timed out before retrying it.',
           output_payload = coalesce(output_payload, '{}'::jsonb) || '{"jobStage":"timed_out"}'::jsonb,
           completed_at = now(),
           updated_at = now()
       where job_kind = $1
         and status = 'running'
         and started_at is not null
         and started_at < now() - make_interval(mins => $2)
       returning *`,
      [jobKind, olderThanMinutes]
    )

    return rows.map((record) => toAiJobRunRow(record as Record<string, unknown>))
  }

  async markRunning(id: string, attempts: number): Promise<void> {
    await this.provider.query(
      `update ai_job_runs
       set status = 'running',
           attempts = $2,
           started_at = now(),
           completed_at = null,
           error_class = null,
           error_message = null,
           output_payload = '{}'::jsonb,
           updated_at = now()
       where id = $1`,
      [id, attempts]
    )
  }

  async patchProgress(id: string, patch: {
    outputPayload?: Record<string, unknown>
    actualModel?: string | null
    fallbackUsed?: boolean
    tokenUsage?: Record<string, unknown>
  }): Promise<void> {
    await this.provider.query(
      `update ai_job_runs
       set output_payload = coalesce(output_payload, '{}'::jsonb) || $2::jsonb,
           actual_model = coalesce($3, actual_model),
           fallback_used = coalesce($4, fallback_used),
           token_usage = case when $5::jsonb = '{}'::jsonb then token_usage else $5::jsonb end,
           updated_at = now()
       where id = $1`,
      [
        id,
        JSON.stringify(patch.outputPayload ?? {}),
        patch.actualModel ?? null,
        patch.fallbackUsed ?? null,
        JSON.stringify(patch.tokenUsage ?? {})
      ]
    )
  }

  async markCompleted(id: string, patch: {
    outputPayload: Record<string, unknown>
    actualModel?: string | null
    fallbackUsed?: boolean
    tokenUsage?: Record<string, unknown>
  }): Promise<void> {
    await this.provider.query(
      `update ai_job_runs
       set status = 'completed',
           output_payload = $2::jsonb,
           actual_model = coalesce($3, actual_model),
           fallback_used = coalesce($4, fallback_used),
           token_usage = $5::jsonb,
           completed_at = now(),
           updated_at = now()
       where id = $1`,
      [id, JSON.stringify(patch.outputPayload), patch.actualModel ?? null, patch.fallbackUsed ?? null, JSON.stringify(patch.tokenUsage ?? {})]
    )
  }

  async markTimedOut(id: string, patch: {
    errorMessage: string
    outputPayload?: Record<string, unknown>
    actualModel?: string | null
    fallbackUsed?: boolean
    tokenUsage?: Record<string, unknown>
  }): Promise<void> {
    await this.provider.query(
      `update ai_job_runs
       set status = 'timed_out',
           error_class = 'JobTimeout',
           error_message = $2,
           output_payload = coalesce(output_payload, '{}'::jsonb) || $3::jsonb,
           actual_model = coalesce($4, actual_model),
           fallback_used = coalesce($5, fallback_used),
           token_usage = $6::jsonb,
           completed_at = now(),
           updated_at = now()
       where id = $1`,
      [
        id,
        patch.errorMessage,
        JSON.stringify(patch.outputPayload ?? {}),
        patch.actualModel ?? null,
        patch.fallbackUsed ?? null,
        JSON.stringify(patch.tokenUsage ?? {})
      ]
    )
  }

  async markFailed(id: string, patch: {
    errorClass: string
    errorMessage: string
    outputPayload?: Record<string, unknown>
    actualModel?: string | null
    fallbackUsed?: boolean
    tokenUsage?: Record<string, unknown>
  }): Promise<void> {
    await this.provider.query(
      `update ai_job_runs
       set status = 'failed',
           error_class = $2,
           error_message = $3,
           output_payload = coalesce(output_payload, '{}'::jsonb) || $4::jsonb,
           actual_model = coalesce($5, actual_model),
           fallback_used = coalesce($6, fallback_used),
           token_usage = $7::jsonb,
           completed_at = now(),
           updated_at = now()
       where id = $1`,
      [
        id,
        patch.errorClass,
        patch.errorMessage,
        JSON.stringify(patch.outputPayload ?? {}),
        patch.actualModel ?? null,
        patch.fallbackUsed ?? null,
        JSON.stringify(patch.tokenUsage ?? {})
      ]
    )
  }

  async listDeferredByProject(projectId: string, limit = 10): Promise<AiJobRunRow[]> {
    const rows = await this.provider.query(
      `select *
       from ai_job_runs
       where project_id = $1
         and status = 'deferred'
         and job_kind = 'session_digest'
       order by created_at asc
       limit $2`,
      [projectId, limit]
    )

    return rows.map((record) => toAiJobRunRow(record as Record<string, unknown>))
  }

  async countRecentAiDigestRunsByProject(projectId: string, sinceHours = 24): Promise<number> {
    const rows = await this.provider.query(
      `select count(*)::int as count
       from ai_job_runs
       where project_id = $1
         and job_kind = 'session_digest'
         and actual_model is not null
         and actual_model <> 'deterministic'
         and created_at >= now() - make_interval(hours => $2)`,
      [projectId, sinceHours]
    )

    return Number((rows[0] as { count?: number } | undefined)?.count ?? 0)
  }

  async countRecentAiDigestRunsByUser(userId: string, sinceHours = 24): Promise<number> {
    const rows = await this.provider.query(
      `select count(*)::int as count
       from ai_job_runs
       where created_by = $1
         and job_kind = 'session_digest'
         and actual_model is not null
         and actual_model <> 'deterministic'
         and created_at >= now() - make_interval(hours => $2)`,
      [userId, sinceHours]
    )

    return Number((rows[0] as { count?: number } | undefined)?.count ?? 0)
  }

  async getLatestAiDigestRunByProject(projectId: string, sinceHours = 24): Promise<AiJobRunRow | null> {
    const rows = await this.provider.query(
      `select *
       from ai_job_runs
       where project_id = $1
         and job_kind = 'session_digest'
         and actual_model is not null
         and actual_model <> 'deterministic'
         and created_at >= now() - make_interval(hours => $2)
       order by created_at desc
       limit 1`,
      [projectId, sinceHours]
    )

    const row = rows[0]
    return row ? toAiJobRunRow(row as Record<string, unknown>) : null
  }
}
