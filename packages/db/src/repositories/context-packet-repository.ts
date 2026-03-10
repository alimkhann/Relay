import type { ComposedContextPacket, ContextPacketRow } from "@relay/shared"
import { isoNow } from "@relay/shared"

import { toContextPacketRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ContextPacketRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByProject(projectId: string): Promise<ContextPacketRow[]> {
    if (this.provider.mode === "memory") {
      return this.provider.store.contextPackets.filter((packet) => packet.projectId === projectId)
    }

    const { data, error } = await this.provider.client
      .from("context_packets")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return (data ?? []).map((record) => toContextPacketRow(record))
  }

  async create(userId: string, projectId: string, targetProfileId: string, packet: ComposedContextPacket): Promise<ContextPacketRow> {
    if (this.provider.mode === "memory") {
      const created: ContextPacketRow = {
        id: crypto.randomUUID(),
        projectId,
        targetProfileId,
        content: packet.content,
        sourceSnapshot: packet.sourceSnapshot,
        createdBy: userId,
        createdAt: isoNow()
      }
      this.provider.store.contextPackets.unshift(created)
      return created
    }

    const { data, error } = await this.provider.client
      .from("context_packets")
      .insert({
        project_id: projectId,
        target_profile_id: targetProfileId,
        content: packet.content,
        source_snapshot: packet.sourceSnapshot,
        created_by: userId
      })
      .select("*")
      .single()

    if (error) throw error
    return toContextPacketRow(data)
  }
}
