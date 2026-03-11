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
    inputPayload: Record<string, unknown>
    primaryModel?: string | null
  }): Promise<AiJobRunRow> {
    const rows = await this.provider.query(
      `insert into ai_job_runs (project_id, session_id, created_by, job_kind, input_payload, primary_model)
       values ($1, $2, $3, $4, $5::jsonb, $6)
       returning *`,
      [input.projectId, input.sessionId, input.createdBy, input.jobKind, JSON.stringify(input.inputPayload), input.primaryModel ?? null]
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

  async markRunning(id: string, attempts: number): Promise<void> {
    await this.provider.query(
      `update ai_job_runs
       set status = 'running',
           attempts = $2,
           started_at = now(),
           updated_at = now()
       where id = $1`,
      [id, attempts]
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

  async markFailed(id: string, patch: {
    errorClass: string
    errorMessage: string
    actualModel?: string | null
    fallbackUsed?: boolean
    tokenUsage?: Record<string, unknown>
  }): Promise<void> {
    await this.provider.query(
      `update ai_job_runs
       set status = 'failed',
           error_class = $2,
           error_message = $3,
           actual_model = coalesce($4, actual_model),
           fallback_used = coalesce($5, fallback_used),
           token_usage = $6::jsonb,
           completed_at = now(),
           updated_at = now()
       where id = $1`,
      [id, patch.errorClass, patch.errorMessage, patch.actualModel ?? null, patch.fallbackUsed ?? null, JSON.stringify(patch.tokenUsage ?? {})]
    )
  }
}
