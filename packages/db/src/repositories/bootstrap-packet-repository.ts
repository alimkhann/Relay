import type { BootstrapPacketRow } from "@relay/shared"

import { toBootstrapPacketRow } from "../mappers/relay-v2-mapper"
import type { DatabaseProvider } from "../store/provider"
import { encryptTextIfConfigured } from "../utils/encrypted-text"

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
         encryptTextIfConfigured(input.content),
        JSON.stringify(input.structuredSnapshot),
        input.renderer,
        JSON.stringify(input.generationMetadata),
        input.createdBy
      ]
    )

    return toBootstrapPacketRow(rows[0] as Record<string, unknown>)
  }

  async updateContent(input: {
    projectId: string
    packetId: string
    content: string
    metadataPatch: Record<string, unknown>
  }): Promise<BootstrapPacketRow | null> {
    const rows = await this.provider.query(
      `update bootstrap_packets
       set content = $3,
           generation_metadata = coalesce(generation_metadata, '{}'::jsonb) || $4::jsonb
       where project_id = $1
         and id = $2
       returning *`,
      [
        input.projectId,
        input.packetId,
        encryptTextIfConfigured(input.content),
        JSON.stringify(input.metadataPatch),
      ]
    )

    const row = rows[0]
    return row ? toBootstrapPacketRow(row as Record<string, unknown>) : null
  }

  async deleteById(projectId: string, packetId: string): Promise<boolean> {
    const rows = await this.provider.query(
      `delete from bootstrap_packets
       where project_id = $1
         and id = $2
       returning id`,
      [projectId, packetId]
    )

    return rows.length > 0
  }

  async clearVariant(projectId: string, targetProfileId: string, kind: BootstrapPacketRow["kind"], keepId?: string): Promise<void> {
    await this.provider.query(
      `delete from bootstrap_packets
       where project_id = $1
         and target_profile_id = $2
         and kind = $3
         and ($4::text is null or id::text <> $4::text)`,
      [projectId, targetProfileId, kind, keepId ?? null]
    )
  }

  async clearProject(projectId: string): Promise<void> {
    await this.provider.query(
      `delete from bootstrap_packets
       where project_id = $1`,
      [projectId]
    )
  }
}
