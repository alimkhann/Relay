import type { CreateMemoryItemInput, MemoryItemRow, UpdateMemoryItemInput } from "@relay/shared"
import { isoNow } from "@relay/shared"

import { toMemoryRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class MemoryRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByProject(projectId: string): Promise<MemoryItemRow[]> {
    if (this.provider.mode === "memory") {
      return this.provider.store.memoryItems
        .filter((item) => item.projectId === projectId && !item.isArchived)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
    }

    const { data, error } = await this.provider.client
      .from("memory_items")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_archived", false)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })

    if (error) throw error
    return (data ?? []).map((record) => toMemoryRow(record))
  }

  async create(userId: string, input: CreateMemoryItemInput): Promise<MemoryItemRow> {
    if (this.provider.mode === "memory") {
      const now = isoNow()
      const item: MemoryItemRow = {
        id: crypto.randomUUID(),
        projectId: input.projectId,
        sourceTurnId: input.sourceTurnId ?? null,
        type: input.type,
        title: input.title ?? null,
        content: input.content,
        pinned: input.pinned ?? false,
        isArchived: false,
        sortOrder: null,
        metadata: input.metadata ?? {},
        createdBy: userId,
        createdAt: now,
        updatedAt: now
      }
      this.provider.store.memoryItems.unshift(item)
      return item
    }

    const { data, error } = await this.provider.client
      .from("memory_items")
      .insert({
        project_id: input.projectId,
        source_turn_id: input.sourceTurnId ?? null,
        type: input.type,
        title: input.title ?? null,
        content: input.content,
        pinned: input.pinned ?? false,
        metadata: input.metadata ?? {},
        created_by: userId
      })
      .select("*")
      .single()

    if (error) throw error
    return toMemoryRow(data)
  }

  async update(id: string, patch: UpdateMemoryItemInput): Promise<MemoryItemRow> {
    if (this.provider.mode === "memory") {
      const item = this.provider.store.memoryItems.find((memory) => memory.id === id)
      if (!item) throw new Error("Memory item not found")
      Object.assign(item, patch, { updatedAt: isoNow() })
      return item
    }

    const { data, error } = await this.provider.client
      .from("memory_items")
      .update({
        title: patch.title,
        content: patch.content,
        type: patch.type,
        pinned: patch.pinned,
        is_archived: patch.isArchived
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) throw error
    return toMemoryRow(data)
  }

  async remove(id: string): Promise<void> {
    if (this.provider.mode === "memory") {
      const item = this.provider.store.memoryItems.find((memory) => memory.id === id)
      if (item) {
        item.isArchived = true
        item.updatedAt = isoNow()
      }
      return
    }

    const { error } = await this.provider.client.from("memory_items").update({ is_archived: true }).eq("id", id)
    if (error) throw error
  }
}
