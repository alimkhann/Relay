import type { ProjectRow } from "@relay/shared"
import { isoNow } from "@relay/shared"

import { fromProjectInput, toProjectRow } from "../mappers/project-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ProjectRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByOwner(ownerId: string): Promise<ProjectRow[]> {
    if (this.provider.mode === "memory") {
      return this.provider.store.projects.filter((project) => project.ownerId === ownerId)
    }

    const { data, error } = await this.provider.client.from("projects").select("*").eq("owner_id", ownerId).order("updated_at", { ascending: false })

    if (error) throw error
    return (data ?? []).map((record) => toProjectRow(record))
  }

  async getById(id: string): Promise<ProjectRow | null> {
    if (this.provider.mode === "memory") {
      return this.provider.store.projects.find((project) => project.id === id) ?? null
    }

    const { data, error } = await this.provider.client.from("projects").select("*").eq("id", id).maybeSingle()

    if (error) throw error
    return data ? toProjectRow(data) : null
  }

  async create(input: { ownerId: string; name: string; slug: string; description?: string | null }): Promise<ProjectRow> {
    if (this.provider.mode === "memory") {
      const now = isoNow()
      const project: ProjectRow = {
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      }
      this.provider.store.projects.unshift(project)
      return project
    }

    const { data, error } = await this.provider.client.from("projects").insert(fromProjectInput(input)).select("*").single()

    if (error) throw error
    return toProjectRow(data)
  }

  async update(id: string, patch: Partial<Pick<ProjectRow, "name" | "slug" | "description" | "isArchived">>): Promise<ProjectRow> {
    if (this.provider.mode === "memory") {
      const project = this.provider.store.projects.find((item) => item.id === id)
      if (!project) throw new Error("Project not found")
      Object.assign(project, patch, { updatedAt: isoNow() })
      return project
    }

    const { data, error } = await this.provider.client
      .from("projects")
      .update({
        name: patch.name,
        slug: patch.slug,
        description: patch.description,
        is_archived: patch.isArchived
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) throw error
    return toProjectRow(data)
  }
}
