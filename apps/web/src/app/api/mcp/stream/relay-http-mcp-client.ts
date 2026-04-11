import { createRepositoryBundle } from "@relay/db"
import type { WorkSessionStructuredState } from "@relay/shared"

import type { Viewer } from "@/server/policies/viewer"
import { composeContextForProject } from "@/server/services/context-service"
import { upsertProjectStateFromMcp } from "@/server/services/mcp-project-state-service"
import { flushWorkSession } from "@/server/services/work-session-flush-service"

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
    const summary = (args.summary as string | undefined) ?? null
    const progress = (args.progress as string | undefined) ?? null
    const decisions = (args.decisions as string[] | undefined) ?? []
    const constraints = (args.constraints as string[] | undefined) ?? []
    const nextSteps = (args.nextSteps as string[] | undefined) ?? []
    const notes = (args.notes as string[] | undefined) ?? []
    const relevantTools = (args.relevantTools as string[] | undefined) ?? []
    const touchedFiles = (args.touchedFiles as string[] | undefined) ?? []
    const currentObjective = (args.currentObjective as string | undefined) ?? null
    const finalize = args.finalize !== false

    const structuredState: WorkSessionStructuredState = {
      summary,
      progress,
      currentObjective,
      decisions,
      constraints,
      nextSteps,
      notes,
      relevantTools,
      touchedFiles,
      reaffirmedFacts: [],
    }

    // Primary path: run through digest + reconcile pipeline by opening a
    // transient work session, attaching the structured state, then flushing.
    try {
      const repositories = createRepositoryBundle(this.viewer.userId)
      const session = await repositories.workSessions.create({
        projectId,
        userId: this.viewer.userId,
        surface: "mcp",
        agentName: "mcp-http",
        clientName: "relay-mcp-http",
        associationMethod: "http_save_context",
        associationConfidence: 0.9,
      })

      await repositories.workSessions.updateLatestState({
        id: session.id,
        latestSummary: progress ?? summary ?? currentObjective ?? decisions[0] ?? null,
        latestStructuredState: structuredState as unknown as Record<string, unknown>,
      })

      await flushWorkSession(this.viewer.userId, projectId, {
        sessionId: session.id,
        reason: finalize ? "explicit" : "sweep",
        summaryShort: progress ?? summary ?? null,
        structuredState,
      })
      return
    } catch {
      // Fall through to legacy pass-through below.
    }

    // Fallback: raw memory items + mcp-state upsert (no digest/reconcile).
    const repositories = createRepositoryBundle(this.viewer.userId)
    const items: Array<{
      projectId: string
      type: "decision" | "constraint" | "task" | "note"
      content: string
      tags: string[]
    }> = []

    for (const d of decisions) items.push({ projectId, type: "decision", content: d, tags: [] })
    for (const c of constraints) items.push({ projectId, type: "constraint", content: c, tags: [] })
    for (const n of nextSteps) items.push({ projectId, type: "task", content: n, tags: [] })
    for (const n of notes) items.push({ projectId, type: "note", content: n, tags: [] })

    if (summary) {
      items.push({ projectId, type: "note", content: `Session summary: ${summary}`, tags: ["session-summary"] })
    }

    if (items.length > 0) {
      await repositories.memory.createBatch(this.viewer.userId, items)
    }

    await upsertProjectStateFromMcp(this.viewer.userId, projectId, {
      recentProgress: progress ?? summary ?? undefined,
      currentObjective: currentObjective ?? undefined,
      decisions,
      constraints,
      openTasks: nextSteps,
      relevantTools,
      replaceLists: false,
    })
  }

  async setProjectState(projectId: string, args: Record<string, unknown>) {
    return upsertProjectStateFromMcp(this.viewer.userId, projectId, {
      projectOverview: args.projectOverview as string | undefined,
      currentObjective: args.currentObjective as string | undefined,
      recentProgress: args.recentProgress as string | undefined,
      stackDomain: args.stackDomain as string | undefined,
      decisions: args.decisions as string[] | undefined,
      constraints: args.constraints as string[] | undefined,
      openTasks: args.openTasks as string[] | undefined,
      relevantTools: args.relevantTools as string[] | undefined,
      replaceLists: args.replaceLists as boolean | undefined,
    })
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

  async recallContext(projectId: string, query: string): Promise<string> {
    const repositories = createRepositoryBundle(this.viewer.userId)
    const [searchResults, state] = await Promise.all([
      repositories.memory.search(projectId, query, { limit: 5 }),
      repositories.projectState.getByProject(projectId),
    ])

    const sections: string[] = []

    if (state) {
      const stateLines: string[] = []
      if (state.projectOverview) stateLines.push(`**Overview:** ${state.projectOverview}`)
      if (state.currentObjective) stateLines.push(`**Current Objective:** ${state.currentObjective}`)
      if (state.recentProgress) stateLines.push(`**Progress:** ${state.recentProgress}`)
      if (stateLines.length > 0) {
        sections.push(`## Project Context\n${stateLines.join("\n")}`)
      }
    }

    if (searchResults.length > 0) {
      const items = searchResults.map((m) =>
        `- [${m.type}] ${m.title ?? m.content.slice(0, 100)}${m.tags.length > 0 ? ` (${m.tags.join(", ")})` : ""}`
      )
      sections.push(`## Matching Memory Items\n${items.join("\n")}`)
    } else {
      sections.push("## Matching Memory Items\nNo matching items found.")
    }

    return sections.join("\n\n")
  }
}
