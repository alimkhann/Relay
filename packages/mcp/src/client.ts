import { saveConfig, type RelayConfig } from "./config.js"

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

  constructor(config: RelayConfig) {
    this.baseUrl = config.apiBase.replace(/\/+$/, "")
    this.token = config.token
    this.refreshToken = config.refreshToken
    this.accessTokenExpiresAt = config.accessTokenExpiresAt
    this.projectId = config.projectId
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

  async delete(path: string): Promise<void> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${this.token}` }
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Relay API error: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`)
    }
  }

  async ensureWorkSession(projectId: string) {
    if (this.workSession?.projectId === projectId) {
      return this.workSession
    }

    if (this.workSession && this.workSession.projectId !== projectId) {
      await this.closeWorkSession()
    }

    const response = await this.post<WorkSessionResponse>(
      `/api/projects/${projectId}/work-sessions/open`,
      {
        surface: "mcp",
        workspaceId: process.cwd(),
        agentName: this.detectAgentName(),
        clientName: "relay-mcp",
        associationMethod: this.projectId ? "config_project" : "auto_detected",
        associationConfidence: this.projectId ? 1 : 0.72,
      },
    )

    this.workSession = response.session
    this.workSessionState = createEmptyAggregateState()
    return response.session
  }

  async getDefaultSince(projectId: string, explicitSince?: string) {
    if (explicitSince) return explicitSince
    const session = await this.ensureWorkSession(projectId)
    return session.baseSyncMarkAt ?? undefined
  }

  async recordSessionEvent(
    projectId: string,
    eventType: string,
    eventPayload?: Record<string, unknown>,
  ) {
    const session = await this.ensureWorkSession(projectId)
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
    if (process.env["GEMINI_CLI"]) return "gemini-cli"
    if (process.env["OPENCODE"]) return "opencode"
    return "mcp-agent"
  }

  private registerShutdownHooks() {
    if (this.hooksRegistered) return
    this.hooksRegistered = true

    process.once("SIGINT", () => {
      void this.closeWorkSession().finally(() => process.exit(0))
    })
    process.once("SIGTERM", () => {
      void this.closeWorkSession().finally(() => process.exit(0))
    })
    process.on("beforeExit", () => {
      void this.closeWorkSession()
    })
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.refreshIfNeeded()

    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.token}`,
      "Accept": "application/json"
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json"
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
      if (response.status === 401 && this.refreshToken) {
        await this.refreshAccessToken()
        return this.request(method, path, body)
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
      throw new Error(message)
    }

    return response.json() as Promise<T>
  }

  private async refreshIfNeeded() {
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
    if (!this.refreshToken) {
      throw new Error("Relay refresh token is missing.")
    }

    const response = await fetch(`${this.baseUrl}/api/mcp/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refreshToken: this.refreshToken })
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Relay refresh failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`)
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

    await saveConfig({
      apiBase: data.apiBase,
      token: data.accessToken,
      refreshToken: data.refreshToken,
      accessTokenExpiresAt: data.accessExpiresAt,
      refreshTokenExpiresAt: data.refreshExpiresAt,
      projectId: this.projectId
    })
  }
}
