import type { BootstrapPacketRow } from "@relay/shared"

import { toBootstrapPacketRow } from "../mappers/relay-v2-mapper"
import type { DatabaseProvider } from "../store/provider"

export class BootstrapPacketRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByProject(projectId: string, limit = 20): Promise<BootstrapPacketRow[]> {
    const rows = await this.provider.query(
      `select *
       from bootstrap_packets
       where project_id = $1
       order by created_at desc
       limit $2`,
      [projectId, limit]
    )

    return rows.map((record) => toBootstrapPacketRow(record as Record<string, unknown>))
  }

  async getLatest(projectId: string, targetProfileId: string, kind: BootstrapPacketRow["kind"]): Promise<BootstrapPacketRow | null> {
    const rows = await this.provider.query(
      `select *
       from bootstrap_packets
       where project_id = $1
         and target_profile_id = $2
         and kind = $3
       order by created_at desc
       limit 1`,
      [projectId, targetProfileId, kind]
    )

    const row = rows[0]
    return row ? toBootstrapPacketRow(row as Record<string, unknown>) : null
  }

  async create(input: {
    projectId: string
    targetProfileId: string
    kind: BootstrapPacketRow["kind"]
    content: string
    structuredSnapshot: Record<string, unknown>
    renderer: BootstrapPacketRow["renderer"]
    generationMetadata: Record<string, unknown>
    createdBy: string
  }): Promise<BootstrapPacketRow> {
    const rows = await this.provider.query(
      `insert into bootstrap_packets (
         project_id,
         target_profile_id,
         kind,
         content,
         structured_snapshot,
         renderer,
         generation_metadata,
         created_by
       )
       values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8)
       returning *`,
      [
        input.projectId,
        input.targetProfileId,
        input.kind,
        input.content,
        JSON.stringify(input.structuredSnapshot),
        input.renderer,
        JSON.stringify(input.generationMetadata),
        input.createdBy
      ]
    )

    return toBootstrapPacketRow(rows[0] as Record<string, unknown>)
  }

  async clearProject(projectId: string): Promise<void> {
    await this.provider.query(
      `delete from bootstrap_packets
       where project_id = $1`,
      [projectId]
    )
  }
}
