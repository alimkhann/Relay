import type { CapturePayload, SourceSessionRow } from "@relay/shared"
import { isoNow } from "@relay/shared"

import { toSessionRow } from "../mappers/session-mapper"
import type { DatabaseProvider } from "../store/provider"

export class SessionRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByProject(projectId: string): Promise<SourceSessionRow[]> {
    if (this.provider.mode === "memory") {
      return this.provider.store.sessions
        .filter((session) => session.projectId === projectId)
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    }

    const { data, error } = await this.provider.client.from("source_sessions").select("*").eq("project_id", projectId).order("captured_at", { ascending: false })

    if (error) throw error
    return (data ?? []).map((record) => toSessionRow(record))
  }

  async create(input: CapturePayload): Promise<SourceSessionRow> {
    if (this.provider.mode === "memory") {
      const now = isoNow()
      const session: SourceSessionRow = {
        id: crypto.randomUUID(),
        projectId: input.projectId,
        platform: input.platform,
        url: input.session.url,
        title: input.session.title ?? null,
        tabId: input.session.tabId ?? null,
        windowId: input.session.windowId ?? null,
        pageFingerprint: input.session.pageFingerprint ?? null,
        metadata: input.session.metadata ?? {},
        capturedAt: now,
        createdAt: now
      }
      this.provider.store.sessions.unshift(session)
      return session
    }

    const { data, error } = await this.provider.client
      .from("source_sessions")
      .insert({
        project_id: input.projectId,
        platform: input.platform,
        url: input.session.url,
        title: input.session.title ?? null,
        tab_id: input.session.tabId ?? null,
        window_id: input.session.windowId ?? null,
        page_fingerprint: input.session.pageFingerprint ?? null,
        metadata: input.session.metadata ?? {}
      })
      .select("*")
      .single()

    if (error) throw error
    return toSessionRow(data)
  }
}
