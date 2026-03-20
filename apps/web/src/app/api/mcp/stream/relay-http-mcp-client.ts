import { createRepositoryBundle } from "@relay/db"

import type { Viewer } from "@/server/policies/viewer"
import { composeContextForProject } from "@/server/services/context-service"

/**
 * Server-side MCP client that calls repositories and services directly
 * instead of going through HTTP. Used by the remote HTTP MCP endpoint.
 */
export class RelayHttpMcpClient {
  private readonly viewer: Viewer

  constructor(viewer: Viewer) {
    this.viewer = viewer
  }

  async listProjects() {
    const repositories = createRepositoryBundle(this.viewer.userId)
    const projects = await repositories.projects.listByOwner(this.viewer.userId)
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
    }))
  }

  async getBrief(projectId: string, args: Record<string, unknown>) {
    const result = await composeContextForProject(this.viewer.userId, projectId, {
      targetProfileKey: (args.targetProfileKey as string) ?? "claude_code_build",
      kind: (args.kind as string) === "quick_continuity" ? "quick_continuity" : "fresh_chat_bootstrap",
      include: (args.include as string[]) ?? [],
      since: args.since as string | undefined,
      syncSurface: (args.syncSurface as string) ?? "mcp",
    })
    return result.packet.content
  }

  async getProjectState(projectId: string) {
    const repositories = createRepositoryBundle(this.viewer.userId)
    const [state, memory] = await Promise.all([
      repositories.projectState.getByProject(projectId),
      repositories.memory.listByProject(projectId),
    ])
    return { state, memory }
  }

  async searchMemory(projectId: string, query: string, options?: { types?: string[]; tags?: string[]; limit?: number }) {
    const repositories = createRepositoryBundle(this.viewer.userId)
    return repositories.memory.search(projectId, query, options)
  }

  async addMemory(projectId: string, input: { type: string; content: string; title?: string; tags?: string[] }) {
    const repositories = createRepositoryBundle(this.viewer.userId)
    return repositories.memory.create(this.viewer.userId, {
      projectId,
      type: input.type as "decision" | "constraint" | "task" | "note" | "artifact" | "requirement",
      content: input.content,
      title: input.title ?? null,
      tags: input.tags ?? [],
    })
  }

  async saveContext(projectId: string, args: Record<string, unknown>) {
    const repositories = createRepositoryBundle(this.viewer.userId)
    const items: Array<{
      projectId: string
      type: "decision" | "constraint" | "task" | "note"
      content: string
      tags: string[]
    }> = []

    const decisions = (args.decisions as string[]) ?? []
    const constraints = (args.constraints as string[]) ?? []
    const nextSteps = (args.nextSteps as string[]) ?? []
    const notes = (args.notes as string[]) ?? []

    for (const d of decisions) items.push({ projectId, type: "decision", content: d, tags: [] })
    for (const c of constraints) items.push({ projectId, type: "constraint", content: c, tags: [] })
    for (const n of nextSteps) items.push({ projectId, type: "task", content: n, tags: [] })
    for (const n of notes) items.push({ projectId, type: "note", content: n, tags: [] })

    if (args.summary) {
      items.push({ projectId, type: "note", content: `Session summary: ${args.summary as string}`, tags: ["session-summary"] })
    }

    if (items.length > 0) {
      await repositories.memory.createBatch(this.viewer.userId, items)
    }
  }

  async manageMemory(args: Record<string, unknown>) {
    const repositories = createRepositoryBundle(this.viewer.userId)
    const memoryId = args.memoryId as string
    const action = args.action as string

    if (action === "delete" || action === "archive") {
      await repositories.memory.remove(memoryId)
    } else if (action === "update") {
      await repositories.memory.update(memoryId, {
        content: args.content as string | undefined,
        title: args.title as string | undefined,
        tags: args.tags as string[] | undefined,
      })
    }
  }

  async updateProject(projectId: string, input: { name?: string; description?: string }) {
    const repositories = createRepositoryBundle(this.viewer.userId)
    await repositories.projects.update(projectId, {
      name: input.name,
      description: input.description,
    })
  }
}
