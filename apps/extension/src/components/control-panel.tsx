import { useEffect, useRef, useState } from "react"

import type { RelayActiveProjectState } from "../messaging/contracts"
import { getActiveTab } from "../utils/browser"
import { getRelaySession, setRelaySession, type RelaySessionState } from "../storage/session"
import { inferTargetProfile, resolveTargetProfile } from "../utils/target-profile"
import styles from "./control-panel.module.css"

interface ControlPanelProps {
  compact?: boolean
}

function defaultDeviceName() {
  const platform = navigator.userAgent.includes("Mac") ? "Mac" : navigator.platform || "browser"
  return `Relay on ${platform}`
}

const emptyActiveState: RelayActiveProjectState = {
  projectId: null,
  projectName: null,
  projectOptions: [],
  showCue: true,
  status: "unavailable",
  message: "Open ChatGPT, Claude, Codex, or Perplexity to use Relay.",
  trustLine: "Built from recent chats and saved project context",
  freshnessText: null,
  shortcutLabel: "Mod+Shift+I",
  canInsert: false,
  page: { supported: false },
  trust: {
    updatedAt: null,
    updatedLabel: null,
    recentChatCount: 0,
    savedContextCount: 0
  },
  remoteStatus: "unavailable",
  issue: null,
  insertKind: "fresh_chat_bootstrap",
  lastSuccessfulSyncAt: null,
  capturePending: false
}

function isRelayActiveProjectState(value: unknown): value is RelayActiveProjectState {
  return Boolean(
    value &&
      typeof value === "object" &&
      "page" in value &&
      typeof (value as RelayActiveProjectState).page?.supported === "boolean" &&
      Array.isArray((value as RelayActiveProjectState).projectOptions)
  )
}

export function ControlPanel({ compact = false }: ControlPanelProps) {
  const [session, setSession] = useState<RelaySessionState | null>(null)
  const [activeState, setActiveState] = useState<RelayActiveProjectState>(emptyActiveState)
  const [status, setStatus] = useState("Relay stays quiet until it is useful.")
  const [busy, setBusy] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [deviceName, setDeviceName] = useState("")
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false)
  const activeStateRequestInFlight = useRef(false)

  useEffect(() => {
    void (async () => {
      setDeviceName(defaultDeviceName())
      await refreshLocalSession()
      await refreshActiveProjectState()
    })()
  }, [])

  useEffect(() => {
    const handleTabActivated = () => {
      void refreshActiveProjectState()
    }

    const handleTabUpdated = (_tabId: number, changeInfo: { status?: string }, tab: { active?: boolean }) => {
      if (changeInfo.status === "complete" && tab.active) {
        void refreshActiveProjectState()
      }
    }

    chrome.tabs.onActivated.addListener(handleTabActivated)
    chrome.tabs.onUpdated.addListener(handleTabUpdated)

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated)
      chrome.tabs.onUpdated.removeListener(handleTabUpdated)
    }
  }, [])

  useEffect(() => {
    const handleRuntimeMessage = (message: unknown) => {
      const payload =
        message &&
        typeof message === "object" &&
        "payload" in message &&
        typeof message.payload === "object" &&
        message.payload
          ? (message.payload as { tabId?: number; state?: RelayActiveProjectState })
          : null

      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "RELAY_ACTIVE_PROJECT_STATE_CHANGED" ||
        !payload
      ) {
        return
      }

      void (async () => {
        const tab = await getActiveTab()
        if (!tab?.id || payload.tabId !== tab.id || !isRelayActiveProjectState(payload.state)) {
          return
        }

        applyActiveState(payload.state)
      })()
    }

    chrome.runtime.onMessage.addListener(handleRuntimeMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
    }
  }, [])

  function applyActiveState(nextState: RelayActiveProjectState) {
    setActiveState(nextState)
    setSession((current) =>
      current
        ? {
            ...current,
            assumedProjectId: nextState.projectId ?? "",
            assumedProjectName: nextState.projectName ?? "",
            trust: nextState.trust
          }
        : current
    )
  }

  async function refreshLocalSession() {
    const nextSession = await getRelaySession()
    setSession(nextSession)
    if (nextSession.lastStatus) {
      setStatus(nextSession.lastStatus)
    }
  }

  async function refreshRemoteSession() {
    try {
      const result = (await chrome.runtime.sendMessage({ type: "RELAY_REFRESH_SESSION" })) as {
        ok?: boolean
        error?: string
      }

      if (result?.error) {
        setStatus(result.error)
        return
      }

      await refreshLocalSession()
      await refreshActiveProjectState()
      setStatus("Relay is connected and ready.")
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Failed to refresh Relay session.")
    }
  }

  async function refreshActiveProjectState() {
    if (activeStateRequestInFlight.current) return

    const tab = await getActiveTab()
    if (!tab?.id) {
      setActiveState(emptyActiveState)
      return
    }

    try {
      activeStateRequestInFlight.current = true
      const response = await chrome.runtime.sendMessage({
        type: "RELAY_GET_ACTIVE_PROJECT_STATE",
        payload: { tabId: tab.id }
      })

      if (!isRelayActiveProjectState(response)) {
        setStatus(
          typeof response === "object" && response && "error" in response && typeof response.error === "string"
            ? response.error
            : "Relay could not load this chat state."
        )

        setActiveState((current) => (current.page.supported || current.projectId ? current : emptyActiveState))
        return
      }

      applyActiveState(response)
    } catch {
      setActiveState(emptyActiveState)
    } finally {
      activeStateRequestInFlight.current = false
    }
  }

  async function openConnectFlow() {
    setBusy(true)
    setStatus("Opening Relay pairing…")

    try {
      await chrome.runtime.sendMessage({
        type: "RELAY_OPEN_CONNECT",
        payload: {
          deviceName: deviceName || defaultDeviceName()
        }
      })
      setStatus("Finish pairing in the Relay tab, then return here.")
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Failed to open pairing flow.")
    } finally {
      setBusy(false)
    }
  }

  async function insertProjectBrief() {
    const tab = await getActiveTab()
    if (!tab?.id) {
      setStatus("Open a supported AI chat first.")
      return
    }

    setBusy(true)
    setStatus("Inserting project brief…")

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_INSERT_PROJECT_BRIEF",
        payload: { tabId: tab.id }
      })) as { ok?: boolean; reason?: string; error?: string }

      if (!result?.ok) {
        setStatus(result?.reason ?? result?.error ?? "Insert project brief failed.")
        return
      }

      setStatus("Inserted the project brief.")
      await refreshLocalSession()
      await refreshActiveProjectState()
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Insert project brief failed.")
    } finally {
      setBusy(false)
    }
  }

  async function saveToProject() {
    const tab = await getActiveTab()
    if (!tab?.id || !activeState.page.supported) {
      setStatus("Save to project works only on a supported AI tab.")
      return
    }

    if (!activeState.projectId) {
      setStatus("Choose a project first.")
      return
    }

    setBusy(true)
    setStatus("Saving selected text…")

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_PIN_SELECTION",
        payload: {
          projectId: activeState.projectId,
          tabId: tab.id
        }
      })) as { ok?: boolean; reason?: string }

      setStatus(result?.ok ? "Saved to project." : result?.reason ?? "Save to project failed.")
      if (result?.ok) {
        await refreshActiveProjectState()
      }
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Save to project failed.")
    } finally {
      setBusy(false)
    }
  }

  async function captureNow() {
    const tab = await getActiveTab()
    if (!tab?.id || !activeState.page.supported) {
      setStatus("Capture now works only on a supported AI tab.")
      return
    }

    if (!activeState.projectId) {
      setStatus("Choose a project first.")
      return
    }

    setBusy(true)
    setStatus("Capturing visible turns…")

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_CAPTURE_VISIBLE",
        payload: {
          projectId: activeState.projectId,
          tabId: tab.id
        }
      })) as { ok?: boolean; turns?: number; reason?: string; digestQueued?: boolean }

      setStatus(
        result?.ok
          ? `Captured ${result.turns ?? 0} visible turns.${result?.digestQueued ? " Relay is updating your project brief." : ""}`
          : result?.reason ?? "Capture failed."
      )

      if (result?.ok) {
        await refreshLocalSession()
        await refreshActiveProjectState()
      }
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Capture failed.")
    } finally {
      setBusy(false)
    }
  }

  async function handleProjectChange(nextProjectId: string) {
    if (!nextProjectId) return

    const tab = await getActiveTab()
    setBusy(true)

    try {
      await chrome.runtime.sendMessage({
        type: "RELAY_SET_ACTIVE_PROJECT",
        payload: {
          projectId: nextProjectId,
          tabId: tab?.id
        }
      })
      await setRelaySession({
        projectId: nextProjectId
      })
      setStatus("Project switched.")
      setProjectSwitcherOpen(false)
      await refreshLocalSession()
      await refreshActiveProjectState()
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Project switch failed.")
    } finally {
      setBusy(false)
    }
  }

  const resolvedTargetProfileKey = resolveTargetProfile({
    platform: activeState.page.platform,
    targetMode: session?.targetMode,
    manualTargetProfileKey: session?.targetProfileKey
  })
  const resolvedTargetLabel = {
    chatgpt_planning: "ChatGPT Planning",
    claude_code_build: "Claude Build",
    codex_implementation: "Codex Build",
    perplexity_research: "Perplexity Research"
  }[resolvedTargetProfileKey]
  const selectedProjectId = activeState.projectId ?? session?.projectId ?? ""
  const shouldShowIssue = Boolean(activeState.issue) && (!activeState.canInsert || activeState.remoteStatus === "stale" || activeState.remoteStatus === "unavailable")

  return (
    <div className={`${styles.shell} ${compact ? styles.compact : styles.expanded}`}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Relay</p>
        <h1 className={styles.title}>{session?.connected ? "Your project is ready for this chat" : "Keep your project ready for the next fresh chat"}</h1>
        <p className={styles.pageState}>
          {activeState.page.supported
            ? `${activeState.page.platform} · ${activeState.page.turns ?? 0} visible turns${activeState.page.isFreshChat ? " · fresh chat detected" : ""}`
            : "Open ChatGPT, Claude, Codex, or Perplexity to activate Relay."}
        </p>
      </section>

      {!session?.connected ? (
        <section className={`${styles.panel} ${styles.primaryPanel}`}>
          <p className={styles.sectionLabel}>Connect Relay in Chrome</p>
          <h2 className={styles.sectionTitle}>Sign in once and let Relay stay quiet.</h2>
          <p className={styles.copy}>Relay auto-captures useful work and keeps the next fresh chat ready without token paste in the normal flow.</p>

          <label className={styles.field}>
            <span>Device name</span>
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
          </label>

          <button className={styles.primaryButton} disabled={busy} onClick={() => void openConnectFlow()}>
            {busy ? "Working…" : "Connect Relay"}
          </button>
        </section>
      ) : (
        <>
          <section className={`${styles.panel} ${styles.primaryPanel}`}>
            <div className={styles.row}>
              <div>
                <p className={styles.sectionLabel}>Current project</p>
                <h2 className={styles.sectionTitle}>{activeState.projectName ?? "Choose a project"}</h2>
              </div>
            </div>

            <p className={styles.statusLine}>{activeState.message}</p>
            {shouldShowIssue ? (
              <div className={styles.infoWrap}>
                <button className={styles.infoButton} type="button" aria-label="Relay issue details">
                  i
                </button>
                <div className={styles.tooltip}>{activeState.issue?.detail}</div>
              </div>
            ) : null}

            <div className={styles.actionGrid}>
              <button className={styles.primaryButton} disabled={busy || !activeState.canInsert} onClick={() => void insertProjectBrief()}>
                {busy ? "Working…" : "Insert project brief"}
              </button>
              <button
                className={styles.secondaryButton}
                disabled={busy || !activeState.projectId || !activeState.page.supported}
                onClick={() => void saveToProject()}>
                Save to project
              </button>
            </div>

            <button className={styles.linkButton} onClick={() => setProjectSwitcherOpen((value) => !value)}>
              Switch project
            </button>

            {projectSwitcherOpen ? (
              <label className={styles.field}>
                <span>Project</span>
                <select value={selectedProjectId} onChange={(event) => void handleProjectChange(event.target.value)}>
                  <option value="">Select a project</option>
                  {activeState.projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className={styles.trustLine}>
              <span>{activeState.trustLine}</span>
              {activeState.freshnessText ? <span>{activeState.freshnessText}</span> : null}
              {activeState.capturePending ? <span>Refreshing from this chat</span> : null}
            </div>
          </section>

          <details
            className={`${styles.panel} ${styles.advancedPanel}`}
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen((event.target as HTMLDetailsElement).open)}>
            <summary className={styles.summary}>
              <span className={styles.summaryTitle}>Advanced</span>
            </summary>

            <label className={styles.field}>
              <span>Target override</span>
              <select
                value={session?.targetMode === "manual" ? session.targetProfileKey : ""}
                onChange={async (event) => {
                  const nextTarget = event.target.value
                  await setRelaySession({
                    targetMode: nextTarget ? "manual" : "auto",
                    targetProfileKey: nextTarget,
                    resolvedTargetProfileKey: nextTarget || inferTargetProfile(activeState.page.platform)
                  })
                  await refreshLocalSession()
                }}>
                <option value="">Automatic</option>
                <option value="chatgpt_planning">ChatGPT planning</option>
                <option value="claude_code_build">Claude build</option>
                <option value="codex_implementation">Codex build</option>
                <option value="perplexity_research">Perplexity research</option>
              </select>
            </label>

            <div className={styles.advancedButtons}>
              <button className={styles.secondaryButton} disabled={busy || !activeState.projectId || !activeState.page.supported} onClick={() => void captureNow()}>
                Capture now
              </button>
              <button className={styles.secondaryButton} disabled={busy} onClick={() => void refreshRemoteSession()}>
                Refresh session
              </button>
            </div>

            <div className={styles.debugCard}>
              <p>{status}</p>
              <p>Remote: {activeState.remoteStatus}</p>
              <p>Target: {session?.targetMode === "manual" ? "Manual" : "Automatic"} · {resolvedTargetLabel}</p>
              <p>Shortcut: {activeState.shortcutLabel}</p>
              {activeState.issue ? <p>Issue: {activeState.issue.detail}</p> : null}
              {activeState.lastSuccessfulSyncAt ? <p>Last sync: {new Date(activeState.lastSuccessfulSyncAt).toLocaleTimeString()}</p> : null}
              {session?.limitedMode ? <p>Fallback mode: using saved project context.</p> : null}
            </div>
          </details>
        </>
      )}
    </div>
  )
}
