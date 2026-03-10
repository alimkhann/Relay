import type { ProjectRow } from "@relay/shared"

import { fromProjectInput, toProjectRow } from "../mappers/project-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ProjectRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByOwner(ownerId: string): Promise<ProjectRow[]> {
    const rows = await this.provider.query(
      `select *
       from projects
       where owner_id = $1
       order by updated_at desc`,
      [ownerId]
    )

    return rows.map((record) => toProjectRow(record as Record<string, unknown>))
  }

  async getById(id: string): Promise<ProjectRow | null> {
    const rows = await this.provider.query(
      `select *
       from projects
       where id = $1
       limit 1`,
      [id]
    )

    const row = rows[0]
    return row ? toProjectRow(row as Record<string, unknown>) : null
  }

  async create(input: { ownerId: string; name: string; slug: string; description?: string | null }): Promise<ProjectRow> {
    const payload = fromProjectInput(input)
    const rows = await this.provider.query(
      `insert into projects (owner_id, name, slug, description)
       values ($1, $2, $3, $4)
       returning *`,
      [payload.owner_id, payload.name, payload.slug, payload.description]
    )

    return toProjectRow(rows[0] as Record<string, unknown>)
  }

  async update(id: string, patch: Partial<Pick<ProjectRow, "name" | "slug" | "description" | "isArchived">>): Promise<ProjectRow> {
    const rows = await this.provider.query(
      `update projects
       set name = coalesce($2, name),
           slug = coalesce($3, slug),
           description = case when $4::boolean then null else coalesce($5, description) end,
           is_archived = coalesce($6, is_archived),
           updated_at = now()
       where id = $1
       returning *`,
      [id, patch.name ?? null, patch.slug ?? null, patch.description === null, patch.description ?? null, patch.isArchived ?? null]
    )

    const row = rows[0]
    if (!row) throw new Error("Project not found")
    return toProjectRow(row as Record<string, unknown>)
  }
}
