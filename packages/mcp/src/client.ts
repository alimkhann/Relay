import type { RelayMcpAnalytics } from "./analytics.js"
import { loadConfig, saveConfig, type RelayConfig } from "./config.js"

interface WorkSessionResponse {
  session: {
    id: string
    projectId: string
    baseSyncMarkAt: string | null
  }
}

interface WorkSessionAggregateState {
  summary?: string | null
  progress?: string | null
  currentObjective?: string | null
  decisions: string[]
  constraints: string[]
  nextSteps: string[]
  notes: string[]
  relevantTools: string[]
  touchedFiles: string[]
  reaffirmedFacts: string[]
}

function createEmptyAggregateState(): WorkSessionAggregateState {
  return {
    summary: null,
    progress: null,
    currentObjective: null,
    decisions: [],
    constraints: [],
    nextSteps: [],
    notes: [],
    relevantTools: [],
    touchedFiles: [],
    reaffirmedFacts: [],
  }
}

function appendUnique(list: string[], values: string[] | undefined) {
  if (!values?.length) return list
  const seen = new Set(list.map((item) => item.toLowerCase()))
  const next = [...list]
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      next.push(normalized)
    }
  }
  return next.slice(0, 12)
}

export class RelayClient {
  private readonly baseUrl: string
  private token: string
  private refreshToken?: string
  private accessTokenExpiresAt?: string
  private readonly projectId?: string
  private workSession: WorkSessionResponse["session"] | null = null
  private workSessionState = createEmptyAggregateState()
  private hooksRegistered = false
  private workSessionDisabled = false
  private refreshPromise: Promise<void> | null = null
  private refreshFailed = false
  private readonly analytics?: RelayMcpAnalytics

  private readonly fallbackToken?: string

  constructor(config: RelayConfig, analytics?: RelayMcpAnalytics) {
    this.baseUrl = config.apiBase.replace(/\/+$/, "")
    this.token = config.token
    this.fallbackToken = config.fallbackToken
    this.refreshToken = config.refreshToken
    this.accessTokenExpiresAt = config.accessTokenExpiresAt
    this.projectId = config.projectId
    this.analytics = analytics
    this.registerShutdownHooks()
  }

  async get<T>(path: string): Promise<T> {
    return this.request("GET", path)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request("POST", path, body)
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request("PATCH", path, body)
  }

  async delete(path: string, _retried = false): Promise<void> {
    await this.refreshIfNeeded()

    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${this.token}` }
    })
    if (response.status === 401 && !_retried) {
      if (this.fallbackToken && this.token !== this.fallbackToken) {
        this.token = this.fallbackToken
        this.refreshToken = undefined
        this.accessTokenExpiresAt = undefined
        return this.delete(path, true)
      }
      if (this.refreshToken && !this.refreshFailed) {
        await this.refreshAccessToken()
        return this.delete(path, true)
      }
      throw new Error("Relay authentication expired. Run 'npx @onrelay/wizard' to re-authenticate.")
    }
    if (response.status === 401) {
      throw new Error("Relay authentication expired. Run 'npx @onrelay/wizard' to re-authenticate.")
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Relay API error: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`)
    }
  }

  async ensureWorkSession(projectId: string) {
    if (this.workSessionDisabled) {
      return null
    }

    if (this.workSession?.projectId === projectId) {
      return this.workSession
    }

    if (this.workSession && this.workSession.projectId !== projectId) {
      await this.closeWorkSession()
    }

    let response: WorkSessionResponse
    try {
      response = await this.post<WorkSessionResponse>(
        `/api/projects/${projectId}/work-sessions/open`,
        {
          surface: "mcp",
          workspaceId: process.cwd(),
          agentName: this.detectAgentName(),
          clientName: this.detectClientName(),
          associationMethod: this.projectId ? "config_project" : "auto_detected",
          associationConfidence: this.projectId ? 1 : 0.72,
        },
      )
    } catch (error) {
      if (error instanceof Error && /Missing required MCP scope|401|403/i.test(error.message)) {
        this.workSessionDisabled = true
        return null
      }
      throw error
    }

    this.workSession = response.session
    this.workSessionState = createEmptyAggregateState()
    this.analytics?.capture("mcp_session_opened", {
      project_id: projectId,
      agent_name: this.detectAgentName(),
    })
    return response.session
  }

  async getDefaultSince(projectId: string, explicitSince?: string) {
    if (explicitSince) return explicitSince
    try {
      const session = await this.ensureWorkSession(projectId)
      return session?.baseSyncMarkAt ?? undefined
    } catch {
      return undefined
    }
  }

  async recordSessionEvent(
    projectId: string,
    eventType: string,
    eventPayload?: Record<string, unknown>,
  ) {
    const session = await this.ensureWorkSession(projectId)
    if (!session) return
    this.analytics?.capture("mcp_tool_called", {
      project_id: projectId,
      tool_name: eventType,
      agent_name: this.detectAgentName(),
      client_name: this.detectClientName(),
      success: true,
    })
    await this.post(`/api/projects/${projectId}/work-sessions/checkpoint`, {
      sessionId: session.id,
      eventType,
      eventPayload,
      structuredState: {},
    })
  }

  async recordSessionMutation(
    projectId: string,
    input: {
      eventType: string
      eventPayload?: Record<string, unknown>
      summary?: string | null
      progress?: string | null
      currentObjective?: string | null
      decisions?: string[]
      constraints?: string[]
      nextSteps?: string[]
      notes?: string[]
      relevantTools?: string[]
      touchedFiles?: string[]
      reaffirmedFacts?: string[]
    },
  ) {
    const session = await this.ensureWorkSession(projectId)
    if (!session) return
    this.analytics?.capture("mcp_tool_completed", {
      project_id: projectId,
      tool_name: input.eventType,
      agent_name: this.detectAgentName(),
      client_name: this.detectClientName(),
      success: true,
      saved_via: input.eventPayload?.["savedVia"] === "relay_save_context" ? "relay_save_context" : null,
    })

    if (input.summary !== undefined) this.workSessionState.summary = input.summary
    if (input.progress !== undefined) this.workSessionState.progress = input.progress
    if (input.currentObjective !== undefined) this.workSessionState.currentObjective = input.currentObjective
    this.workSessionState.decisions = appendUnique(this.workSessionState.decisions, input.decisions)
    this.workSessionState.constraints = appendUnique(this.workSessionState.constraints, input.constraints)
    this.workSessionState.nextSteps = appendUnique(this.workSessionState.nextSteps, input.nextSteps)
    this.workSessionState.notes = appendUnique(this.workSessionState.notes, input.notes)
    this.workSessionState.relevantTools = appendUnique(this.workSessionState.relevantTools, input.relevantTools)
    this.workSessionState.touchedFiles = appendUnique(this.workSessionState.touchedFiles, input.touchedFiles)
    this.workSessionState.reaffirmedFacts = appendUnique(this.workSessionState.reaffirmedFacts, input.reaffirmedFacts)

    await this.post(`/api/projects/${projectId}/work-sessions/checkpoint`, {
      sessionId: session.id,
      eventType: input.eventType,
      eventPayload: input.eventPayload,
      summaryShort: this.buildSummaryShort(),
      structuredState: this.workSessionState,
      confidence: 0.66,
    })
  }

  async closeWorkSession() {
    if (!this.workSession) return
    const { id, projectId } = this.workSession

    try {
      await this.post(`/api/projects/${projectId}/work-sessions/close`, {
        sessionId: id,
        summaryShort: this.buildSummaryShort(),
        structuredState: this.hasMeaningfulState() ? this.workSessionState : undefined,
        confidence: this.hasMeaningfulState() ? 0.72 : undefined,
      })
    } catch {
      // Best-effort close
    } finally {
      this.workSession = null
      this.workSessionState = createEmptyAggregateState()
    }
  }

  /**
   * Flush the active work session through Relay's digest + reconcile pipeline.
   * This is the autonomous save path: structured state → digest → project
   * state merge → conflict reconciliation → session closed.
   *
   * Safe to call repeatedly: a closed session is a no-op on the server.
   */
  async flushWorkSession(reason = "explicit") {
    if (!this.workSession) return
    const { id, projectId } = this.workSession

    try {
      await this.post(`/api/projects/${projectId}/work-sessions/flush`, {
        sessionId: id,
        reason,
        summaryShort: this.buildSummaryShort() ?? null,
        structuredState: this.hasMeaningfulState() ? this.workSessionState : null,
      })
      this.analytics?.capture("mcp_session_flushed", {
        project_id: projectId,
        reason,
        success: true,
      })
    } catch {
      // Best-effort flush
    } finally {
      this.workSession = null
      this.workSessionState = createEmptyAggregateState()
    }
  }

  /**
   * Sweep any open work sessions for this viewer+project — used by hook-driven
   * flush where the caller may not have the session object in memory yet
   * (e.g. `relay-flush` CLI invoked from Claude Code `PreCompact`).
   */
  async sweepOpenWorkSessions(projectId: string, options?: { idleMs?: number; reason?: string; limit?: number }) {
    try {
      return await this.post<{ flushedCount: number; skippedCount: number }>(
        `/api/projects/${projectId}/work-sessions/flush`,
        {
          reason: options?.reason ?? "sweep",
          idleMs: options?.idleMs ?? 0,
          limit: options?.limit ?? 3,
        },
      )
    } catch {
      return { flushedCount: 0, skippedCount: 0 }
    }
  }

  private buildSummaryShort() {
    return (
      this.workSessionState.progress ??
      this.workSessionState.summary ??
      this.workSessionState.currentObjective ??
      this.workSessionState.decisions[0] ??
      this.workSessionState.nextSteps[0] ??
      undefined
    )
  }

  private hasMeaningfulState() {
    const state = this.workSessionState
    return Boolean(
      state.summary ||
        state.progress ||
        state.currentObjective ||
        state.decisions.length ||
        state.constraints.length ||
        state.nextSteps.length ||
        state.notes.length ||
        state.relevantTools.length ||
        state.touchedFiles.length ||
        state.reaffirmedFacts.length,
    )
  }

  private detectAgentName() {
    if (process.env["RELAY_AGENT_NAME"]) return process.env["RELAY_AGENT_NAME"]
    if (process.env["CLAUDECODE"] || process.env["CLAUDE_CODE"]) return "claude-code"
    if (process.env["CURSOR_TRACE_ID"] || process.env["CURSOR_AGENT"]) return "cursor"
    if (process.env["WINDSURF"] || process.env["WINDSURF_AGENT"]) return "windsurf"
    if (process.env["GEMINI_CLI"]) return "gemini-cli"
    if (process.env["OPENCODE"]) return "opencode"
    return "mcp-agent"
  }

  private detectClientName() {
    return `relay-mcp:${this.detectAgentName()}`
  }

  private detectSyncSurface() {
    const agent = this.detectAgentName()

    if (agent === "claude-code") return "claude" as const
    if (agent === "cursor") return "cursor" as const
    if (agent === "windsurf") return "windsurf" as const
    if (agent === "opencode") return "opencode" as const
    if (agent === "gemini-cli") return "gemini" as const

    return "mcp" as const
  }

  getDefaultSyncSurface() {
    return this.detectSyncSurface()
  }

  private registerShutdownHooks() {
    if (this.hooksRegistered) return
    this.hooksRegistered = true

    const shutdown = async (exitCode?: number) => {
      // Prefer the flush pipeline (runs digest + reconcile before closing).
      // Falls back gracefully on any error inside flushWorkSession.
      await this.flushWorkSession("session_end")
      await this.analytics?.shutdown()
      if (typeof exitCode === "number") {
        process.exit(exitCode)
      }
    }

    process.once("SIGINT", () => {
      void shutdown(0)
    })
    process.once("SIGTERM", () => {
      void shutdown(0)
    })
    process.on("beforeExit", () => {
      void shutdown()
    })
  }

  private async request<T>(method: string, path: string, body?: unknown, _attempt = 0): Promise<T> {
    await this.refreshIfNeeded()

    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.token}`,
      "Accept": "application/json"
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json"
    }

    let response: Response

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30_000)
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
    } catch (error) {
      // Timeout or network error — retry up to 2 times with backoff
      if (_attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** _attempt))
        return this.request(method, path, body, _attempt + 1)
      }
      this.analytics?.capture("mcp_request_exception", {
        project_id: this.workSession?.projectId ?? this.projectId ?? null,
        success: false,
        method,
        path,
      })
      this.analytics?.capture("mcp_tool_failed", {
        project_id: this.workSession?.projectId ?? this.projectId ?? null,
        tool_name: path,
        failure_stage: "request_exception",
        success: false,
      })
      this.analytics?.captureException(error, {
        project_id: this.workSession?.projectId ?? this.projectId ?? null,
        method,
        path,
      })
      throw error
    }

    if (!response.ok) {
      if (response.status === 401) {
        // Try fallback CLI token before refresh/re-auth
        if (this.fallbackToken && this.token !== this.fallbackToken && _attempt === 0) {
          this.token = this.fallbackToken
          this.refreshToken = undefined
          this.accessTokenExpiresAt = undefined
          return this.request(method, path, body, 1)
        }
        if (this.refreshFailed || !this.refreshToken) {
          throw new Error("Relay authentication expired. Run 'npx @onrelay/wizard' to re-authenticate.")
        }
        await this.refreshAccessToken()
        return this.request(method, path, body, 0)
      }

      if (response.status === 429) {
        const data = await response.json().catch(() => ({})) as {
          error?: string
          plan?: string
          upgradeUrl?: string
          retryAfterSeconds?: number
        }
        const retryAfterHeader = response.headers.get("Retry-After")
        const retryAfterSec = data.retryAfterSeconds ?? (retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0)

        // Retry up to 2 times if server says retry is short (< 30s)
        if (_attempt < 2 && retryAfterSec > 0 && retryAfterSec < 30) {
          await new Promise((r) => setTimeout(r, retryAfterSec * 1000))
          return this.request(method, path, body, _attempt + 1)
        }

        let message = data.error ?? "Rate limit exceeded."
        if (retryAfterSec > 0) {
          const resetAt = new Date(Date.now() + retryAfterSec * 1000)
          message += `\nQuota resets at ${resetAt.toLocaleTimeString()} (in ${Math.ceil(retryAfterSec / 60)} min).`
        }
        if (data.plan && data.plan !== "pro" && data.upgradeUrl) {
          message += `\nUpgrade for higher limits: ${data.upgradeUrl}`
        }
        this.analytics?.capture("mcp_request_failed", {
          project_id: this.workSession?.projectId ?? this.projectId ?? null,
          success: false,
          method,
          path,
          status: response.status,
        })
        this.analytics?.capture("mcp_tool_failed", {
          project_id: this.workSession?.projectId ?? this.projectId ?? null,
          tool_name: path,
          failure_stage: "rate_limit",
          status: response.status,
          success: false,
        })
        throw new Error(message)
      }

      const text = await response.text().catch(() => "")
      let message = `Relay API error: ${response.status} ${response.statusText}`
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string; message?: string }
          message += ` — ${parsed.error ?? parsed.message ?? text}`
        } catch {
          message += ` — ${text}`
        }
      }

      this.analytics?.capture("mcp_request_failed", {
        project_id: this.workSession?.projectId ?? this.projectId ?? null,
        success: false,
        method,
        path,
        status: response.status,
      })
      this.analytics?.capture("mcp_tool_failed", {
        project_id: this.workSession?.projectId ?? this.projectId ?? null,
        tool_name: path,
        failure_stage: "http_response",
        status: response.status,
        success: false,
      })

      throw new Error(message)
    }

    return response.json() as Promise<T>
  }

  private async refreshIfNeeded() {
    if (this.refreshFailed) {
      throw new Error("Relay authentication expired. Run 'npx @onrelay/wizard' to re-authenticate.")
    }

    if (!this.refreshToken || !this.accessTokenExpiresAt) {
      return
    }

    const expiresAt = new Date(this.accessTokenExpiresAt).getTime()
    if (Number.isNaN(expiresAt) || expiresAt - Date.now() > 60_000) {
      return
    }

    await this.refreshAccessToken()
  }

  private async refreshAccessToken() {
    if (this.refreshPromise) {
      await this.refreshPromise
      return
    }

    this.refreshPromise = (async () => {
      if (!this.refreshToken) {
        throw new Error("Relay refresh token is missing.")
      }

      const refreshAbort = new AbortController()
      const refreshTimeout = setTimeout(() => refreshAbort.abort(), 15_000)
      let response = await fetch(`${this.baseUrl}/api/mcp/refresh`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
        signal: refreshAbort.signal,
      })
      clearTimeout(refreshTimeout)

      // If refresh fails (token consumed externally), try re-reading config from disk
      // in case the wizard or another process wrote fresh tokens.
      if (!response.ok && (response.status === 401 || response.status === 403)) {
        const diskConfig = await loadConfig().catch(() => null)
        if (diskConfig?.refreshToken && diskConfig.refreshToken !== this.refreshToken) {
          // Disk has a different refresh token — try it
          this.token = diskConfig.token
          this.refreshToken = diskConfig.refreshToken
          this.accessTokenExpiresAt = diskConfig.accessTokenExpiresAt

          // Check if the disk token is still valid (not expired)
          const diskExpiry = diskConfig.accessTokenExpiresAt
            ? new Date(diskConfig.accessTokenExpiresAt).getTime()
            : 0
          if (diskExpiry - Date.now() > 60_000) {
            // Disk access token is still valid, no need to refresh
            return
          }

          response = await fetch(`${this.baseUrl}/api/mcp/refresh`, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ refreshToken: this.refreshToken })
          })
        }
      }

      // Retry 429 on refresh up to 3 times with backoff
      if (response.status === 429) {
        for (let attempt = 0; attempt < 3 && response.status === 429; attempt++) {
          const retryAfter = response.headers.get("Retry-After")
          const waitSec = retryAfter ? Math.min(parseInt(retryAfter, 10) || 2, 10) : 2 * (attempt + 1)
          await new Promise((r) => setTimeout(r, waitSec * 1000))
          response = await fetch(`${this.baseUrl}/api/mcp/refresh`, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: this.refreshToken })
          })
        }
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "")
        this.refreshFailed = true
        this.refreshToken = undefined
        this.analytics?.capture("mcp_token_refresh_failed", {
          project_id: this.workSession?.projectId ?? this.projectId ?? null,
          success: false,
          status: response.status,
        })
        throw new Error("Relay authentication expired. Run 'npx @onrelay/wizard' to re-authenticate.")
      }

      const data = await response.json() as {
        accessToken: string
        refreshToken: string
        accessExpiresAt: string
        refreshExpiresAt: string
        apiBase: string
      }

      this.token = data.accessToken
      this.refreshToken = data.refreshToken
      this.accessTokenExpiresAt = data.accessExpiresAt
      this.analytics?.capture("mcp_token_refreshed", {
        project_id: this.workSession?.projectId ?? this.projectId ?? null,
        success: true,
      })

      await saveConfig({
        apiBase: data.apiBase,
        token: data.accessToken,
        refreshToken: data.refreshToken,
        accessTokenExpiresAt: data.accessExpiresAt,
        refreshTokenExpiresAt: data.refreshExpiresAt,
        projectId: this.projectId
      })
    })()

    try {
      await this.refreshPromise
    } finally {
      this.refreshPromise = null
    }
  }
}
