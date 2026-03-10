import type { ComposedContextPacket, ContextPacketRow } from "@relay/shared"

import { toContextPacketRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ContextPacketRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByProject(projectId: string): Promise<ContextPacketRow[]> {
    const rows = await this.provider.query(
      `select *
       from context_packets
       where project_id = $1
       order by created_at desc`,
      [projectId]
    )

    return rows.map((record) => toContextPacketRow(record as Record<string, unknown>))
  }

  async create(userId: string, projectId: string, targetProfileId: string, packet: ComposedContextPacket): Promise<ContextPacketRow> {
    const rows = await this.provider.query(
      `insert into context_packets (project_id, target_profile_id, content, source_snapshot, created_by)
       values ($1, $2, $3, $4::jsonb, $5)
       returning *`,
      [projectId, targetProfileId, packet.content, JSON.stringify(packet.sourceSnapshot), userId]
    )

    return toContextPacketRow(rows[0] as Record<string, unknown>)
  }
}
