import type { ProjectBindingInput, ProjectBindingRow } from "@relay/shared"

import { toBindingRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class BindingRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async bind(userId: string, input: ProjectBindingInput): Promise<ProjectBindingRow> {
    const existingRows = await this.provider.query(
      `select *
       from project_bindings
       where user_id = $1
         and binding_kind = $2
         and coalesce(domain, '') = coalesce($3, '')
         and coalesce(tab_id, '') = coalesce($4, '')
       limit 1`,
      [userId, input.bindingKind, input.domain ?? null, input.tabId ?? null]
    )

    if (existingRows[0]) {
      const rows = await this.provider.query(
        `update project_bindings
         set project_id = $2,
             platform = $3,
             updated_at = now()
         where id = $1
         returning *`,
        [String(existingRows[0].id), input.projectId, input.platform ?? null]
      )

      return toBindingRow(rows[0] as Record<string, unknown>)
    }

    const rows = await this.provider.query(
      `insert into project_bindings (user_id, project_id, binding_kind, domain, tab_id, platform)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [userId, input.projectId, input.bindingKind, input.domain ?? null, input.tabId ?? null, input.platform ?? null]
    )

    return toBindingRow(rows[0] as Record<string, unknown>)
  }

  async resolve(userId: string, input: { domain?: string | null; tabId?: string | null; platform?: string | null }): Promise<ProjectBindingRow | null> {
    const rows = await this.provider.query(
      `select *
       from project_bindings
       where user_id = $1
         and (
           (binding_kind = 'tab' and coalesce(tab_id, '') = coalesce($2, ''))
           or
           (binding_kind = 'domain' and coalesce(domain, '') = coalesce($3, ''))
           or
           (binding_kind = 'manual')
         )
       order by
         case
           when binding_kind = 'tab' and coalesce(tab_id, '') = coalesce($2, '') then 0
           when binding_kind = 'domain' and coalesce(domain, '') = coalesce($3, '') and coalesce(platform, '') = coalesce($4, '') then 1
           when binding_kind = 'domain' and coalesce(domain, '') = coalesce($3, '') then 2
           when binding_kind = 'manual' then 3
           else 4
         end,
         updated_at desc
       limit 1`,
      [userId, input.tabId ?? null, input.domain ?? null, input.platform ?? null]
    )

    const row = rows[0]
    return row ? toBindingRow(row as Record<string, unknown>) : null
  }
}
