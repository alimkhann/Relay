import { createRepositoryBundle, getProjectDashboard } from "@relay/db"
import {
  createExternalSourceSchema,
  promoteSourceCitationSchema,
  resolveDefaultTargetProfileKey,
  searchProjectSourcesSchema,
  type MemoryItemRow,
  type WorkSessionStructuredState,
} from "@relay/shared"
import type { ProjectSummaryDto } from "@relay/shared"

import type { Viewer } from "@/server/policies/viewer"
import {
  getMemoryForExplainability,
  listBriefsForExplainability,
  listMemoryForExplainability,
  listRecentContinuityActivity,
  listSessionsForExplainability,
  traceContextSources,
} from "@/server/services/continuity-explainability-service"
import { archiveProjectSession, deleteProjectBrief } from "@/server/services/project-governance-service"
import { generateBootstrapForProject, getLatestBootstrapForProject } from "@/server/services/bootstrap-service"
import { upsertProjectStateFromMcp } from "@/server/services/mcp-project-state-service"
import { listProjectsForUser } from "@/server/services/project-service"
import {
  createExternalSource,
  getProjectSourceDetail,
  listProjectSources,
  promoteSourceCitation,
  refreshExternalSource,
  searchProjectSources,
} from "@/server/services/source-service"
import { getSyncMarkForUser, recordSyncMarkForUser } from "@/server/services/sync-mark-service"
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
    const projects = await listProjectsForUser(this.viewer.userId)
    return projects.map((p: ProjectSummaryDto) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      memoryCount: p.memoryCount,
      sessionCount: p.sessionCount,
      keywords: p.routingContext?.keywords ?? [],
      updatedAt: p.updatedAt,
    }))
  }

  private getDefaultTargetProfileKey(syncSurface?: string | null) {
    return resolveDefaultTargetProfileKey({
      syncSurface: (syncSurface ?? "mcp") as never,
      clientName: "relay-mcp-http",
    })
  }

  async getBrief(projectId: string, args: Record<string, unknown>) {
    const syncSurface = (args.syncSurface as string) ?? "mcp"
    const targetProfileKey = (args.targetProfileKey as string) ?? this.getDefaultTargetProfileKey(syncSurface)
    const include = ((args.include as string[] | undefined) ?? []) as Array<"state" | "memory">
    const generate = args.generate !== false
    const since = await this.resolveDefaultSince(projectId, args.since as string | undefined)
    const kind = await this.resolveBriefKind(projectId, {
      kind: args.kind as string | undefined,
      since,
    })
    const dashboard = await getProjectDashboard(createRepositoryBundle(this.viewer.userId), this.viewer.userId, projectId).catch(() => null)

    const buildResumeMetadata = (resolvedTargetProfileKey: string) => ({
      project: dashboard ? { id: dashboard.project.id, name: dashboard.project.name, slug: dashboard.project.slug } : null,
      latestDurableDecisions: (dashboard?.projectState?.decisions ?? []).slice(0, 4),
      freshness: {
        driftHint: dashboard?.stateStatus?.rawCapturePresent
          ? "Recent raw captures are present and may not be fully reflected in the generated brief yet."
          : dashboard?.stateStatus?.digestStatus && ["pending", "running", "failed", "timed_out"].includes(dashboard.stateStatus.digestStatus)
            ? `Digest status is ${dashboard.stateStatus.digestStatus}, so newer continuity may still be settling.`
            : dashboard?.projectState?.dirty
              ? "Relay project state is marked dirty, so treat this brief as provisional and inspect context before mutating."
              : null,
        stateStatus: dashboard?.stateStatus ?? null,
        since: since ?? null,
      },
      briefPolicy: {
        targetProfileKey: resolvedTargetProfileKey,
        kind,
        syncSurface,
        resumeGuidance:
          "If this brief is coherent and on the correct project, do not call list_projects, set_current_project, get_project_state, list_sessions, list_briefs, or search_context just to restate the same continuity.",
      },
    })

    if (generate) {
      const result = await generateBootstrapForProject(this.viewer.userId, projectId, {
        targetProfileKey,
        kind,
        since: kind === "quick_continuity" ? since : args.since as string | undefined,
        syncSurface,
      })
      if (result.status === "ready" && result.packet) {
        await recordSyncMarkForUser(this.viewer.userId, projectId, syncSurface as Parameters<typeof recordSyncMarkForUser>[2])
        return {
          text: include.length > 0
            ? await this.appendIncludeSections(projectId, result.packet.content, include)
            : result.packet.content,
          structured: {
            brief: {
              status: "ready",
              kind,
              syncSurface,
              since: since ?? null,
              packetId: result.packet.id,
              targetProfileKey: result.resolvedTargetProfileKey,
            },
            resumeMetadata: buildResumeMetadata(result.resolvedTargetProfileKey),
          },
        }
      }
      return {
        text: `Brief generation is in progress. ${result.reason ?? "Please try again in a moment."}`,
        structured: {
          brief: {
            status: "pending",
            kind,
            syncSurface,
            since: since ?? null,
            targetProfileKey: result.resolvedTargetProfileKey,
          },
          resumeMetadata: buildResumeMetadata(result.resolvedTargetProfileKey),
        },
      }
    }

    const packet = await getLatestBootstrapForProject(this.viewer.userId, projectId, targetProfileKey, kind)
    if (!packet) {
      return {
        text: "No cached brief available. Try calling with generate=true to create one.",
        structured: {
          brief: {
            status: "missing",
            kind,
            syncSurface,
            since: since ?? null,
            targetProfileKey,
          },
          resumeMetadata: buildResumeMetadata(targetProfileKey),
        },
      }
    }
    await recordSyncMarkForUser(this.viewer.userId, projectId, syncSurface as Parameters<typeof recordSyncMarkForUser>[2])
    return {
      text: include.length > 0
        ? await this.appendIncludeSections(projectId, packet.content, include)
        : packet.content,
      structured: {
        brief: {
          status: "ready",
          kind,
          syncSurface,
          since: since ?? null,
          packetId: packet.id,
          targetProfileKey,
        },
        resumeMetadata: buildResumeMetadata(targetProfileKey),
      },
    }
  }

  private async resolveDefaultSince(projectId: string, explicitSince?: string) {
    if (explicitSince) return explicitSince
    const syncMark = await getSyncMarkForUser(this.viewer.userId, projectId, "mcp")
    return syncMark?.lastSyncAt ?? undefined
  }

  private async resolveBriefKind(
    projectId: string,
    input: { kind?: string; since?: string },
  ) {
    if (input.kind === "quick_continuity" || input.kind === "fresh_chat_bootstrap") {
      return input.kind
    }

    const repositories = createRepositoryBundle(this.viewer.userId)
    const dashboard = await getProjectDashboard(repositories, this.viewer.userId, projectId).catch(() => null)
    const state = dashboard?.projectState ?? dashboard?.derivedProjectState ?? null
    const stateDirty = Boolean(state?.dirty)
    const stateStatus = dashboard?.stateStatus

    const isQuickCandidate =
      Boolean(input.since) &&
      Boolean(stateStatus?.projectStateReady) &&
      !stateDirty &&
      stateStatus?.rawCapturePresent !== true &&
      !["pending", "running", "failed", "timed_out"].includes(stateStatus?.digestStatus ?? "idle")

    return isQuickCandidate ? "quick_continuity" : "fresh_chat_bootstrap"
  }

  async getProjectState(projectId: string) {
    const repositories = createRepositoryBundle(this.viewer.userId)
    const [state, memory] = await Promise.all([
      repositories.projectState.getByProject(projectId),
      repositories.memory.listByProject(projectId),
    ])
    return { state, memory }
  }

  private async appendIncludeSections(
    projectId: string,
    briefText: string,
    include: Array<"state" | "memory">,
  ) {
    if (include.length === 0) return briefText
    const repositories = createRepositoryBundle(this.viewer.userId)
    const [state, memory] = await Promise.all([
      repositories.projectState.getByProject(projectId),
      repositories.memory.listByProject(projectId),
    ])
    const sections: string[] = [briefText, "", "---"]
    if (include.includes("state") && state) {
      sections.push("", "## Raw State (JSON)", JSON.stringify(state, null, 2))
    }
    if (include.includes("memory") && memory.length > 0) {
      sections.push("", "## Memory Items (JSON)", JSON.stringify(memory, null, 2))
    }
    return sections.join("\n")
  }

  async searchMemory(projectId: string, query: string, options?: { types?: string[]; tags?: string[]; limit?: number }) {
    const repositories = createRepositoryBundle(this.viewer.userId)
    return repositories.memory.search(projectId, query, options)
  }

  async listMemory(projectId: string, options?: {
    archived?: boolean
    pinned?: boolean
    tag?: string
    types?: string[]
    limit?: number
    sort?: "updated_desc" | "created_desc"
  }) {
    return listMemoryForExplainability(this.viewer.userId, projectId, {
      archived: options?.archived,
      pinned: options?.pinned,
      tag: options?.tag,
      types: options?.types as MemoryItemRow["type"][] | undefined,
      limit: options?.limit,
      sort: options?.sort,
    })
  }

  async getMemory(memoryId: string, projectId?: string) {
    return getMemoryForExplainability(this.viewer.userId, memoryId, projectId)
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
    const memoryIds = Array.isArray(args.memoryId) ? args.memoryId as string[] : [args.memoryId as string]
    const action = args.action as string

    if (action === "delete") {
      for (const memoryId of memoryIds) {
        await repositories.memory.remove(memoryId)
      }
    } else if (action === "archive") {
      for (const memoryId of memoryIds) {
        await repositories.memory.update(memoryId, { isArchived: true })
      }
    } else if (action === "update") {
      for (const memoryId of memoryIds) {
        await repositories.memory.update(memoryId, {
          content: args.content as string | undefined,
          title: args.title as string | undefined,
          tags: args.tags as string[] | undefined,
        })
      }
    }
  }

  async updateProject(projectId: string, input: { name?: string; description?: string }) {
    const repositories = createRepositoryBundle(this.viewer.userId)
    await repositories.projects.update(projectId, {
      name: input.name,
      description: input.description,
    })
  }

  async listSessions(projectId: string, options?: {
    includeArchived?: boolean
    limit?: number
    surfaces?: string[]
  }) {
    return listSessionsForExplainability(this.viewer.userId, projectId, options)
  }

  async archiveSession(projectId: string, sessionId: string, archived = true) {
    return archiveProjectSession(this.viewer.userId, projectId, sessionId, { archived })
  }

  async listBriefs(projectId: string, options?: { limit?: number }) {
    return listBriefsForExplainability(this.viewer.userId, projectId, options)
  }

  async regenerateBrief(projectId: string, args: Record<string, unknown>) {
    const result = await generateBootstrapForProject(this.viewer.userId, projectId, {
      targetProfileKey: (args.targetProfileKey as string) ?? this.getDefaultTargetProfileKey((args.syncSurface as string) ?? "mcp"),
      kind: (args.kind as string) === "quick_continuity" ? "quick_continuity" : "fresh_chat_bootstrap",
      since: args.since as string | undefined,
      syncSurface: (args.syncSurface as string) ?? "mcp",
    })
    if (result.status === "ready" && result.packet) {
      await recordSyncMarkForUser(
        this.viewer.userId,
        projectId,
        ((args.syncSurface as string) ?? "mcp") as Parameters<typeof recordSyncMarkForUser>[2],
      )
    }
    return result
  }

  async deleteBrief(projectId: string, packetId: string) {
    await deleteProjectBrief(this.viewer.userId, projectId, packetId)
  }

  async traceContext(projectId: string, options: { query?: string; stateField?: string; limit?: number }) {
    return traceContextSources(this.viewer.userId, projectId, options)
  }

  async listRecentActivity(projectId: string, options?: { limit?: number }) {
    return listRecentContinuityActivity(this.viewer.userId, projectId, options)
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

  async listSources(projectId: string) {
    return { sources: await listProjectSources(this.viewer.userId, projectId) }
  }

  async createExternalSource(projectId: string, args: Record<string, unknown>) {
    const parsed = createExternalSourceSchema.parse({
      url: args.url,
      displayName: args.displayName,
      sourceType: args.sourceType,
      provider: args.provider,
    })
    return createExternalSource(this.viewer.userId, {
      projectId,
      ...parsed,
    })
  }

  async searchSources(projectId: string, args: Record<string, unknown>) {
    const parsed = searchProjectSourcesSchema.parse({
      query: args.query,
      sourceId: args.sourceId,
      kinds: args.kinds,
      mode: args.mode,
      limit: args.limit,
    })
    return searchProjectSources(this.viewer.userId, projectId, parsed)
  }

  async getSourceDetail(projectId: string, sourceId: string) {
    return getProjectSourceDetail(this.viewer.userId, projectId, sourceId)
  }

  async refreshSource(projectId: string, sourceId: string) {
    return refreshExternalSource(this.viewer.userId, projectId, sourceId)
  }

  async promoteSourceCitation(projectId: string, sourceId: string, args: Record<string, unknown>) {
    const parsed = promoteSourceCitationSchema.parse({
      chunkId: args.chunkId,
      type: args.type,
      title: args.title,
      content: args.content,
    })
    return promoteSourceCitation(this.viewer.userId, projectId, sourceId, parsed)
  }
}
