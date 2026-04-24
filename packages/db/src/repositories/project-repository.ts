import type { ProjectRow } from "@relay/shared"

import { fromProjectInput, toProjectRow } from "../mappers/project-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ProjectRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByOwner(ownerId: string, input: { includeArchived?: boolean } = {}): Promise<ProjectRow[]> {
    const includeArchived = input.includeArchived ?? false
    const rows = await this.provider.query(
      `select *
       from projects
       where owner_id = $1
         and ($2::boolean or is_archived = false)
       order by updated_at desc`,
      [ownerId, includeArchived]
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

  async create(input: { ownerId: string; name: string; slug: string; description?: string | null; projectUrl?: string | null }): Promise<ProjectRow> {
    const payload = fromProjectInput(input)
    const rows = await this.provider.query(
      `insert into projects (owner_id, name, slug, description, project_url)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [payload.owner_id, payload.name, payload.slug, payload.description, payload.project_url]
    )

    return toProjectRow(rows[0] as Record<string, unknown>)
  }

  async createIfUnderActiveLimit(input: {
    ownerId: string
    name: string
    slug: string
    description?: string | null
    projectUrl?: string | null
    activeProjectLimit: number
  }): Promise<ProjectRow | null> {
    const payload = fromProjectInput(input)
    const rows = await this.provider.query(
      `with project_lock as (
         select pg_advisory_xact_lock(hashtext($1))
       ), active_projects as (
         select count(*)::int as count
         from projects
         where owner_id = $1
           and is_archived = false
       ), inserted as (
         insert into projects (owner_id, name, slug, description, project_url)
         select $1, $2, $3, $4, $6
         from active_projects
         where count < $5
         returning *
       )
       select * from inserted`,
      [payload.owner_id, payload.name, payload.slug, payload.description, input.activeProjectLimit, payload.project_url],
    )

    const row = rows[0]
    return row ? toProjectRow(row as Record<string, unknown>) : null
  }

  async updateArchiveStateWithLimit(input: {
    id: string
    isArchived: boolean
    activeProjectLimit: number
  }): Promise<ProjectRow | null> {
    const rows = await this.provider.query(
      `with target as (
         select id, owner_id, is_archived
         from projects
         where id = $1
       ), project_lock as (
         select pg_advisory_xact_lock(hashtext(owner_id))
         from target
       ), active_projects as (
         select count(*)::int as count
         from projects
         where owner_id = (select owner_id from target)
           and is_archived = false
           and id <> $1
       )
       update projects
       set is_archived = $2,
           updated_at = now()
       where id = $1
         and ($2::boolean = true or (select count from active_projects) < $3)
       returning *`,
      [input.id, input.isArchived, input.activeProjectLimit],
    )

    const row = rows[0]
    return row ? toProjectRow(row as Record<string, unknown>) : null
  }

  async hardDelete(id: string): Promise<boolean> {
    const rows = await this.provider.query(
      `delete from projects where id = $1 returning id`,
      [id]
    )
    return rows.length > 0
  }

  async update(id: string, patch: Partial<Pick<ProjectRow, "name" | "slug" | "description" | "projectUrl" | "isArchived">>): Promise<ProjectRow> {
    const rows = await this.provider.query(
      `update projects
       set name = coalesce($2, name),
           slug = coalesce($3, slug),
           description = case when $4::boolean then null else coalesce($5, description) end,
           project_url = case when $6::boolean then null else coalesce($7, project_url) end,
           is_archived = coalesce($8, is_archived),
           updated_at = now()
       where id = $1
       returning *`,
      [
        id,
        patch.name ?? null,
        patch.slug ?? null,
        patch.description === null,
        patch.description ?? null,
        patch.projectUrl === null,
        patch.projectUrl ?? null,
        patch.isArchived ?? null,
      ]
    )

    const row = rows[0]
    if (!row) throw new Error("Project not found")
    return toProjectRow(row as Record<string, unknown>)
  }
}
