import type { ProjectSummarySnapshotKind, ProjectSummarySnapshotRow } from "@relay/shared"

import { toProjectSummarySnapshotRow } from "../mappers/canon-mapper"
import type { DatabaseProvider } from "../store/provider"
import { encryptTextIfConfigured } from "../utils/encrypted-text"

const PROJECT_SUMMARY_SNAPSHOT_COLS = `id, project_id, kind, content, derived_from, generation_metadata, created_by, created_at`

export class ProjectSummarySnapshotRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listLatestByProject(projectId: string, options?: { kind?: ProjectSummarySnapshotKind; limit?: number }): Promise<ProjectSummarySnapshotRow[]> {
    const conditions = ["project_id = $1"]
    const params: unknown[] = [projectId]
    let paramIndex = 2

    if (options?.kind) {
      conditions.push(`kind = $${paramIndex}`)
      params.push(options.kind)
      paramIndex++
    }

    params.push(options?.limit ?? 10)

    const rows = await this.provider.query(
      `select ${PROJECT_SUMMARY_SNAPSHOT_COLS}
       from project_summary_snapshots
       where ${conditions.join(" and ")}
       order by created_at desc
       limit $${paramIndex}`,
      params,
    )

    return rows.map((row) => toProjectSummarySnapshotRow(row as Record<string, unknown>))
  }

  async create(userId: string | null, input: {
    projectId: string
    kind: ProjectSummarySnapshotKind
    content: string
    derivedFrom: string[]
    generationMetadata: Record<string, unknown>
  }): Promise<ProjectSummarySnapshotRow> {
    const rows = await this.provider.query(
      `insert into project_summary_snapshots (project_id, kind, content, derived_from, generation_metadata, created_by)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       returning ${PROJECT_SUMMARY_SNAPSHOT_COLS}`,
      [
        input.projectId,
        input.kind,
        encryptTextIfConfigured(input.content),
        JSON.stringify(input.derivedFrom ?? []),
        JSON.stringify(input.generationMetadata ?? {}),
        userId,
      ],
    )

    return toProjectSummarySnapshotRow(rows[0] as Record<string, unknown>)
  }

  async searchByProject(projectId: string, query: string, options?: {
    kind?: ProjectSummarySnapshotKind
    historicalAt?: string | null
    limit?: number
  }): Promise<ProjectSummarySnapshotRow[]> {
    const conditions = ["project_id = $1", `to_tsvector('english', content) @@ websearch_to_tsquery('english', $2)`]
    const params: unknown[] = [projectId, query]
    let paramIndex = 3

    if (options?.kind) {
      conditions.push(`kind = $${paramIndex}`)
      params.push(options.kind)
      paramIndex++
    }

    if (options?.historicalAt) {
      conditions.push(`((generation_metadata->>'session_date') is null or (generation_metadata->>'session_date')::timestamptz <= $${paramIndex}::timestamptz)`)
      params.push(options.historicalAt)
      paramIndex++
    }

    params.push(options?.limit ?? 8)

    const rows = await this.provider.query(
      `select ${PROJECT_SUMMARY_SNAPSHOT_COLS}
       from project_summary_snapshots
       where ${conditions.join(" and ")}
       order by ts_rank(to_tsvector('english', content), websearch_to_tsquery('english', $2)) desc, created_at desc
       limit $${paramIndex}`,
      params,
    )

    return rows.map((row) => toProjectSummarySnapshotRow(row as Record<string, unknown>))
  }
}
