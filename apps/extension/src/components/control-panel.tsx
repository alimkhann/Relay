import { useEffect, useState } from "react"

import { getRelaySession, setRelaySession } from "../storage/session"
import { getActiveTab } from "../utils/browser"
import styles from "./control-panel.module.css"

interface ControlPanelProps {
  compact?: boolean
}

interface ProjectOption {
  id: string
  name: string
}

const targetOptions = [
  { value: "claude_code_build", label: "Claude Code" },
  { value: "codex_implementation", label: "Codex" },
  { value: "chatgpt_planning", label: "ChatGPT Planning" },
  { value: "perplexity_research", label: "Perplexity Research" }
]

const defaultApiBase = process.env.PLASMO_PUBLIC_RELAY_API_BASE ?? "http://localhost:3000"

export function ControlPanel({ compact = false }: ControlPanelProps) {
  const [apiBase, setApiBase] = useState(defaultApiBase)
  const [token, setToken] = useState("")
  const [projectId, setProjectId] = useState("")
  const [targetProfileKey, setTargetProfileKey] = useState("claude_code_build")
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [status, setStatus] = useState("Paste an extension token from Relay settings, then load your projects.")
  const [pageState, setPageState] = useState("Waiting for a supported tab.")
  const [pageSupported, setPageSupported] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const session = await getRelaySession()
      setApiBase(session.apiBase)
      setToken(session.token)
      setProjectId(session.projectId)
      setTargetProfileKey(session.targetProfileKey)

      await refreshPageState()

      if (session.token) {
        await loadProjects(session.apiBase, session.token, session.projectId)
      }
    })()
  }, [])

  function formatError(cause: unknown, fallback: string) {
    if (cause instanceof Error) {
      if (cause.message.includes("Could not establish connection") || cause.message.includes("Receiving end does not exist")) {
        return "Open ChatGPT, Claude, or Perplexity in the active tab, then try again."
      }

      return cause.message
    }

    return fallback
  }

  async function refreshPageState() {
    const tab = await getActiveTab()
    if (!tab?.id) {
      setPageSupported(false)
      setPageState("No active tab found.")
      return null
    }

    try {
      const state = await chrome.tabs.sendMessage(tab.id, { type: "RELAY_PAGE_STATE" })
      if (state?.supported) {
        setPageSupported(true)
        setPageState(`${state.platform} · ${state.turns} visible turns`)
        return { tab, state }
      }
    } catch {
      // Ignore messaging failures and fall through to the unsupported state.
    }

    setPageSupported(false)
    setPageState("Open ChatGPT, Claude, or Perplexity to activate Relay.")
    return null
  }

  async function requireSupportedTab(actionLabel: string) {
    const result = await refreshPageState()
    if (!result?.tab?.id) {
      setStatus(`${actionLabel} works only on a supported AI tab.`)
      return null
    }

    return result.tab
  }

  async function loadProjects(nextApiBase = apiBase, nextToken = token, preferredProjectId = projectId) {
    if (!nextToken) {
      setProjects([])
      setProjectId("")
      setStatus("Paste an extension token first.")
      return
    }

    const response = await fetch(`${nextApiBase}/api/projects`, {
      headers: {
        authorization: `Bearer ${nextToken}`
      }
    })

    if (!response.ok) {
      throw new Error(response.status === 401 ? "Extension token was rejected." : "Failed to load projects.")
    }

    const result = (await response.json()) as {
      projects: ProjectOption[]
    }

    setProjects(result.projects)

    if (result.projects.length === 0) {
      setProjectId("")
      await setRelaySession({
        apiBase: nextApiBase,
        token: nextToken,
        projectId: ""
      })
      setStatus("No projects yet. Create one in the Relay dashboard, then reload projects here.")
      return
    }

    const nextProjectId = preferredProjectId && result.projects.some((project) => project.id === preferredProjectId)
      ? preferredProjectId
      : result.projects[0]?.id ?? ""

    setProjectId(nextProjectId)
    await setRelaySession({
      apiBase: nextApiBase,
      token: nextToken,
      projectId: nextProjectId
    })
  }

  async function saveConnection() {
    setBusy(true)
    setStatus("Saving connection…")

    try {
      await setRelaySession({
        apiBase,
        token,
        targetProfileKey
      })

      await loadProjects(apiBase, token)
      setStatus("Connection saved. Pick a project and Relay is ready.")
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Connection failed.")
    } finally {
      setBusy(false)
    }
  }

  async function bindProject() {
    if (!projectId) {
      setStatus("Pick a project first.")
      return
    }

    const tab = await requireSupportedTab("Binding")
    if (!tab?.id) return

    setBusy(true)
    setStatus("Binding tab…")

    try {
      await setRelaySession({ apiBase, token, projectId, targetProfileKey })
      const result = await chrome.runtime.sendMessage({
        type: "RELAY_BIND_PROJECT",
        payload: {
          projectId,
          tabId: String(tab.id),
          domain: tab.url ? new URL(tab.url).hostname : null
        }
      })
      if (result?.error) {
        setStatus(result.error)
        return
      }
      setStatus("Project bound to this tab.")
    } catch (cause) {
      setStatus(formatError(cause, "Bind failed."))
    } finally {
      setBusy(false)
    }
  }

  async function capture() {
    if (!projectId) {
      setStatus("Pick a project first.")
      return
    }

    const tab = await requireSupportedTab("Capture")
    if (!tab?.id) return

    setBusy(true)
    setStatus("Capturing visible turns…")

    try {
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: "RELAY_CAPTURE_VISIBLE",
        payload: { projectId }
      })
      setStatus(result?.ok ? `Captured ${result.turns} visible turns and saved them to this project.` : result?.reason ?? "Capture failed.")
    } catch (cause) {
      setStatus(formatError(cause, "Capture failed."))
    } finally {
      setBusy(false)
    }
  }

  async function composeAndInsert() {
    if (!projectId) {
      setStatus("Pick a project first.")
      return
    }

    const tab = await requireSupportedTab("Compose and insert")
    if (!tab?.id) return

    setBusy(true)
    setStatus("Composing context packet…")

    try {
      const composed = await chrome.runtime.sendMessage({
        type: "RELAY_COMPOSE_CONTEXT",
        payload: { projectId, targetProfileKey }
      })

      const content = composed?.packet?.content ?? composed?.packet?.packet?.content
      if (!content) {
        setStatus(composed?.error ?? "Context composition failed.")
        return
      }

      setStatus("Inserting context into the prompt…")
      const inserted = await chrome.tabs.sendMessage(tab.id, {
        type: "RELAY_INSERT_CONTEXT",
        payload: { content }
      })

      setStatus(inserted?.ok ? "Context inserted into the prompt." : inserted?.reason ?? "Insert failed.")
    } catch (cause) {
      setStatus(formatError(cause, "Compose and insert failed."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${styles.shell} ${compact ? styles.compact : styles.expanded}`}>
      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Relay</p>
          <h1 className={styles.title}>Project memory for the next AI tab.</h1>
        </div>
        <p className={styles.pageState}>{pageState}</p>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.sectionLabel}>Connection</p>
            <h2 className={styles.sectionTitle}>Authenticate the extension</h2>
          </div>
          <button className={styles.secondaryButton} disabled={busy} onClick={() => void refreshPageState()}>
            Refresh tab
          </button>
        </div>

        <label className={styles.field}>
          <span>API base</span>
          <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
        </label>

        <label className={styles.field}>
          <span>Extension token</span>
          <textarea rows={3} value={token} onChange={(event) => setToken(event.target.value)} />
        </label>

        <div className={styles.inlineRow}>
          <a className={styles.helpLink} href={`${apiBase}/settings`} target="_blank" rel="noreferrer">
            Open Relay settings
          </a>
          <button className={styles.primaryButton} disabled={busy} onClick={() => void saveConnection()}>
            {busy ? "Working…" : "Save connection"}
          </button>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.sectionLabel}>Project</p>
            <h2 className={styles.sectionTitle}>Pick the active project</h2>
          </div>
          <button className={styles.secondaryButton} disabled={busy || !token} onClick={() => void loadProjects()}>
            Reload projects
          </button>
        </div>

        <label className={styles.field}>
          <span>Project</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Target profile</span>
          <select value={targetProfileKey} onChange={(event) => setTargetProfileKey(event.target.value)}>
            {targetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.actionGrid}>
          <button className={styles.primaryButton} disabled={busy || !projectId || !pageSupported} onClick={() => void bindProject()}>
            Bind this tab
          </button>
          <button className={styles.secondaryButton} disabled={busy || !projectId || !pageSupported} onClick={() => void capture()}>
            Capture visible turns
          </button>
          <button className={styles.secondaryButton} disabled={busy || !projectId || !pageSupported} onClick={() => void composeAndInsert()}>
            Compose and insert
          </button>
        </div>
      </div>

      <div className={styles.statusCard}>
        <p className={styles.sectionLabel}>Status</p>
        <p className={styles.statusText}>{status}</p>
      </div>
    </div>
  )
}
