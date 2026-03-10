import type { ProjectBindingInput, ProjectBindingRow } from "@relay/shared"
import { isoNow } from "@relay/shared"

import { toBindingRow } from "../mappers/memory-mapper"
import type { DatabaseProvider } from "../store/provider"

export class BindingRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async bind(userId: string, input: ProjectBindingInput): Promise<ProjectBindingRow> {
    if (this.provider.mode === "memory") {
      const existing = this.provider.store.bindings.find(
        (binding) =>
          binding.userId === userId &&
          binding.bindingKind === input.bindingKind &&
          binding.tabId === (input.tabId ?? null) &&
          binding.domain === (input.domain ?? null)
      )

      if (existing) {
        Object.assign(existing, {
          projectId: input.projectId,
          platform: input.platform ?? null,
          updatedAt: isoNow()
        })
        return existing
      }

      const created: ProjectBindingRow = {
        id: crypto.randomUUID(),
        userId,
        projectId: input.projectId,
        bindingKind: input.bindingKind,
        domain: input.domain ?? null,
        tabId: input.tabId ?? null,
        platform: input.platform ?? null,
        createdAt: isoNow(),
        updatedAt: isoNow()
      }

      this.provider.store.bindings.unshift(created)
      return created
    }

    const { data, error } = await this.provider.client
      .from("project_bindings")
      .upsert({
        user_id: userId,
        project_id: input.projectId,
        binding_kind: input.bindingKind,
        domain: input.domain ?? null,
        tab_id: input.tabId ?? null,
        platform: input.platform ?? null
      })
      .select("*")
      .single()

    if (error) throw error
    return toBindingRow(data)
  }
}
