import { useEffect, useState } from "react"
import type { ProjectStateStatusDto } from "@relay/shared"

import { getActiveTab } from "../utils/browser"
import { getRelaySession, setRelaySession, type RelaySessionState } from "../storage/session"
import { inferTargetProfile, resolveTargetProfile } from "../utils/target-profile"
import styles from "./control-panel.module.css"

interface ControlPanelProps {
  compact?: boolean
}

interface ProjectOption {
  id: string
  name: string
}

interface PageState {
  supported: boolean
  platform?: string
  title?: string | null
  url?: string
  turns?: number
  isFreshChat?: boolean
}

function defaultDeviceName() {
  const platform = navigator.userAgent.includes("Mac") ? "Mac" : navigator.platform || "browser"
  return `Relay on ${platform}`
}

export function ControlPanel({ compact = false }: ControlPanelProps) {
  const [session, setSession] = useState<RelaySessionState | null>(null)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [pageState, setPageState] = useState<PageState>({ supported: false })
  const [status, setStatus] = useState("Relay stays quiet until it is useful.")
  const [busy, setBusy] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [deviceName, setDeviceName] = useState("")
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false)

  useEffect(() => {
    void (async () => {
      setDeviceName(defaultDeviceName())
      await refreshLocalSession()
      await refreshPageState()
    })()
  }, [])

  useEffect(() => {
    const handleTabActivated = () => {
      void refreshPageState()
    }

    const handleTabUpdated = (_tabId: number, changeInfo: { status?: string }, tab: { active?: boolean }) => {
      if (changeInfo.status === "complete" && tab.active) {
        void refreshPageState()
      }
    }

    chrome.tabs.onActivated.addListener(handleTabActivated)
    chrome.tabs.onUpdated.addListener(handleTabUpdated)

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated)
      chrome.tabs.onUpdated.removeListener(handleTabUpdated)
    }
  }, [])

  async function refreshLocalSession() {
    const nextSession = await getRelaySession()
    setSession(nextSession)

    if (nextSession.connected) {
      await refreshRemoteSession()
    } else if (nextSession.lastStatus) {
      setStatus(nextSession.lastStatus)
    }
  }

  async function refreshRemoteSession() {
    try {
      const result = (await chrome.runtime.sendMessage({ type: "RELAY_REFRESH_SESSION" })) as {
        ok?: boolean
        projects?: ProjectOption[]
        settings?: { settings?: { autoCapture?: boolean; defaultTargetProfileKey?: string } }
        error?: string
      }

      if (result?.error) {
        setStatus(result.error)
        return
      }

      const nextSession = await getRelaySession()
      setSession(nextSession)
      setProjects(result?.projects ?? [])
      setStatus(nextSession.lastStatus || "Relay is connected and ready.")
      await triggerAutoCapture("Connection refreshed.")
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Failed to refresh Relay session.")
    }
  }

  async function refreshPageState() {
    const tab = await getActiveTab()
    if (!tab?.id) {
      setPageState({ supported: false })
      return
    }

    try {
      const state = (await chrome.tabs.sendMessage(tab.id, { type: "RELAY_PAGE_STATE" })) as PageState
      setPageState(state ?? { supported: false })
      const nextResolvedTarget = resolveTargetProfile({
        platform: state?.platform,
        targetMode: session?.targetMode,
        manualTargetProfileKey: session?.targetProfileKey
      })
      await setRelaySession({ resolvedTargetProfileKey: nextResolvedTarget })
      setSession((current) => (current ? { ...current, resolvedTargetProfileKey: nextResolvedTarget } : current))
    } catch {
      setPageState({ supported: false })
    }
  }

  async function triggerAutoCapture(prefix?: string) {
    const tab = await getActiveTab()
    if (!tab?.id) {
      return
    }

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "RELAY_TRIGGER_AUTO_CAPTURE",
        payload: { tabId: tab.id }
      })) as {
        ok?: boolean
        skipped?: boolean
        turns?: number
        digestQueued?: boolean
        reason?: string
        stateStatus?: ProjectStateStatusDto | null
      }

      if (!result?.ok) {
        if (prefix && result?.reason) {
          setStatus(`${prefix} ${result.reason}`)
        }
        return
      }

      if (result.skipped) {
        setStatus(`${prefix ? `${prefix} ` : ""}Skipped: ${result.reason ?? "No new changes to capture."}`)
        return
      }

      if (result.stateStatus) {
        await setRelaySession({ stateStatus: result.stateStatus })
        setSession((current) => (current ? { ...current, stateStatus: result.stateStatus ?? null } : current))
      }

      setStatus(
        `${prefix ? `${prefix} ` : ""}Auto-captured ${result.turns ?? 0} visible turns.${result.digestQueued ? " Digest queued." : " State unchanged."}`
      )
    } catch {
      return
    }
  }

  async function requireSupportedTab(actionLabel: string) {
    const tab = await getActiveTab()
    if (!tab?.id || !pageState.supported) {
      setStatus(`${actionLabel} works only on a supported AI tab.`)
      return null
    }

    return tab
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
      setStatus("Finish pairing in the Relay tab, then come back here.")
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Failed to open pairing flow.")
    } finally {
      setBusy(false)
    }
  }

  async function insertBootstrap() {
    if (!session?.projectId) {
      setStatus("Choose a project first.")
      return
    }

    const tab = await requireSupportedTab("Insert bootstrap")
    if (!tab?.id) return

    setBusy(true)
    setStatus(pageState.isFreshChat ? "Preparing fresh-chat bootstrap…" : "Preparing continuity bootstrap…")

    try {
      const targetProfileKey = resolveTargetProfile({
        platform: pageState.platform,
        targetMode: session.targetMode,
        manualTargetProfileKey: session.targetProfileKey
      })
      const kind = pageState.isFreshChat ? "fresh_chat_bootstrap" : "quick_continuity"
      const generated = (await chrome.runtime.sendMessage({
        type: "RELAY_GENERATE_BOOTSTRAP",
        payload: {
          projectId: session.projectId,
          targetProfileKey,
          kind,
          deep: kind === "fresh_chat_bootstrap"
        }
      })) as {
        status?: "ready" | "pending"
        packet?: {
          content?: string
          renderer?: string
          generationMetadata?: Record<string, unknown>
        }
        reason?: string | null
        resolvedTargetProfileKey?: string
        stateStatus?: ProjectStateStatusDto | null
        error?: string
      }

      if (generated?.stateStatus) {
        await setRelaySession({
          stateStatus: generated.stateStatus,
          resolvedTargetProfileKey: generated.resolvedTargetProfileKey ?? targetProfileKey
        })
        setSession((current) =>
          current
            ? {
                ...current,
                stateStatus: generated.stateStatus ?? null,
                resolvedTargetProfileKey: generated.resolvedTargetProfileKey ?? current.resolvedTargetProfileKey
              }
            : current
        )
      }

      if (generated?.status === "pending" || !generated?.packet) {
        setStatus(generated?.reason ?? "Relay is still building project state for this chat.")
        return
      }

      const content = generated?.packet?.content
      if (!content) {
        setStatus(generated?.error ?? "Bootstrap generation failed.")
        return
      }

      const inserted = await chrome.tabs.sendMessage(tab.id, {
        type: "RELAY_INSERT_CONTEXT",
        payload: { content }
      })

      if (inserted?.ok) {
        const actualModel = String(generated.packet?.generationMetadata?.actual_model ?? "")
        const limitedMode = actualModel === "deterministic"
        if (limitedMode) {
          await setRelaySession({ limitedMode: true, lastStatus: "Inserted a limited-mode bootstrap." })
          setStatus("Inserted a limited-mode bootstrap.")
        } else {
          await setRelaySession({ limitedMode: false, lastStatus: "Bootstrap inserted into the prompt." })
          setStatus("Bootstrap inserted into the prompt.")
        }
      } else {
        setStatus(inserted?.reason ?? "Insert failed.")
      }
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Insert bootstrap failed.")
    } finally {
      setBusy(false)
    }
  }

  async function pinSelection() {
    if (!session?.projectId) {
      setStatus("Choose a project first.")
      return
    }

    const tab = await requireSupportedTab("Pin selection")
    if (!tab?.id) return

    setBusy(true)
    setStatus("Saving selected text…")

    try {
      const result = await chrome.runtime.sendMessage({
        type: "RELAY_PIN_SELECTION",
        payload: {
          projectId: session.projectId,
          tabId: tab.id
        }
      })

      setStatus(result?.ok ? "Selection pinned to the current project." : result?.reason ?? "Pin selection failed.")
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Pin selection failed.")
    } finally {
      setBusy(false)
    }
  }

  async function captureManually() {
    if (!session?.projectId) {
      setStatus("Choose a project first.")
      return
    }

    const tab = await requireSupportedTab("Capture")
    if (!tab?.id) return

    setBusy(true)
    setStatus("Capturing visible turns…")

    try {
      const result = await chrome.runtime.sendMessage({
        type: "RELAY_CAPTURE_VISIBLE",
        payload: {
          projectId: session.projectId,
          tabId: tab.id
        }
      }) as { ok?: boolean; turns?: number; reason?: string; digestQueued?: boolean; stateStatus?: ProjectStateStatusDto | null }

      if (result?.stateStatus) {
        await setRelaySession({ stateStatus: result.stateStatus })
        setSession((current) => (current ? { ...current, stateStatus: result.stateStatus ?? null } : current))
      }

      setStatus(
        result?.ok
          ? `Captured ${result.turns ?? 0} visible turns.${result?.digestQueued ? " Digest queued." : ""}`
          : result?.reason ?? "Capture failed."
      )
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Capture failed.")
    } finally {
      setBusy(false)
    }
  }

  async function handleProjectChange(nextProjectId: string) {
    if (!session) return
    await setRelaySession({
      projectId: nextProjectId,
      targetMode: "auto",
      targetProfileKey: "",
      stateStatus: null
    })
    setSession({ ...session, projectId: nextProjectId, targetMode: "auto", targetProfileKey: "", stateStatus: null })
    setStatus("Project switched.")
    await triggerAutoCapture("Project switched.")
  }

  const currentProject = projects.find((project) => project.id === session?.projectId) ?? null
  const readyLabel = pageState.isFreshChat ? "Bootstrap ready" : "Ready on this chat"
  const resolvedTargetProfileKey = resolveTargetProfile({
    platform: pageState.platform,
    targetMode: session?.targetMode,
    manualTargetProfileKey: session?.targetProfileKey
  })
  const resolvedTargetLabel = {
    chatgpt_planning: "ChatGPT Planning",
    claude_code_build: "Claude Code Build",
    codex_implementation: "Codex Implementation",
    perplexity_research: "Perplexity Research"
  }[resolvedTargetProfileKey]
  const captureStatusLabel = session?.stateStatus?.rawCapturePresent ? "Captured" : "Waiting"
  const digestStatusLabel = session?.stateStatus?.digestStatus ? session.stateStatus.digestStatus.replace("_", " ") : "idle"
  const projectStateLabel = session?.stateStatus?.projectStateReady ? "Ready" : "Pending"

  return (
    <div className={`${styles.shell} ${compact ? styles.compact : styles.expanded}`}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <p className={styles.eyebrow}>Relay</p>
          {session?.connected ? <span className={styles.badge}>{readyLabel}</span> : null}
        </div>
        <h1 className={styles.title}>
          {session?.connected ? "Project memory for the next AI tab." : "Quiet continuity for fresh AI chats."}
        </h1>
        <p className={styles.pageState}>
          {pageState.supported
            ? `${pageState.platform} · ${pageState.turns ?? 0} visible turns${pageState.isFreshChat ? " · fresh chat detected" : ""}`
            : "Open ChatGPT, Claude, Perplexity, or Codex to activate Relay."}
        </p>
      </section>

      {!session?.connected ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionLabel}>Connection</p>
              <h2 className={styles.sectionTitle}>Connect Relay once</h2>
            </div>
          </div>

          <label className={styles.field}>
            <span>Device name</span>
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
          </label>

          <div className={styles.actionGrid}>
            <button className={styles.primaryButton} disabled={busy} onClick={() => void openConnectFlow()}>
              {busy ? "Working…" : "Connect Relay"}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.sectionLabel}>Current project</p>
                <h2 className={styles.sectionTitle}>{currentProject?.name ?? "Choose a project"}</h2>
              </div>
              <button className={styles.ghostButton} onClick={() => setProjectSwitcherOpen((value) => !value)}>
                Switch project
              </button>
            </div>

            {projectSwitcherOpen ? (
              <label className={styles.field}>
                <span>Project</span>
                <select value={session.projectId} onChange={(event) => void handleProjectChange(event.target.value)}>
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className={styles.metaText}>
                {pageState.isFreshChat
                  ? "Relay can drop a full bootstrap into this new chat."
                  : "Relay keeps state nearby and can insert a smaller continuity packet on demand."}
              </p>
            )}

            <div className={styles.statusGrid}>
              <div className={styles.statusPill}>
                <span>Capture</span>
                <strong>{captureStatusLabel}</strong>
              </div>
              <div className={styles.statusPill}>
                <span>Digest</span>
                <strong>{digestStatusLabel}</strong>
              </div>
              <div className={styles.statusPill}>
                <span>State</span>
                <strong>{projectStateLabel}</strong>
              </div>
            </div>

            <div className={styles.actionGrid}>
              <button className={styles.primaryButton} disabled={busy || !session.projectId || !pageState.supported} onClick={() => void insertBootstrap()}>
                Insert bootstrap
              </button>
              <button className={styles.secondaryButton} disabled={busy || !session.projectId || !pageState.supported} onClick={() => void pinSelection()}>
                Pin selection
              </button>
            </div>
          </section>

          <details className={styles.panel} open={advancedOpen} onToggle={(event) => setAdvancedOpen((event.target as HTMLDetailsElement).open)}>
            <summary className={styles.summary}>
              <span>
                <span className={styles.sectionLabel}>Advanced</span>
                <span className={styles.summaryTitle}>Manual controls and diagnostics</span>
              </span>
            </summary>

            <label className={styles.field}>
              <span>Target override</span>
              <select
                value={session.targetMode === "manual" ? session.targetProfileKey : ""}
                onChange={async (event) => {
                  const nextTarget = event.target.value
                  await setRelaySession({
                    targetMode: nextTarget ? "manual" : "auto",
                    targetProfileKey: nextTarget,
                    resolvedTargetProfileKey: nextTarget || inferTargetProfile(pageState.platform)
                  })
                  setSession((current) =>
                    current
                      ? {
                          ...current,
                          targetMode: nextTarget ? "manual" : "auto",
                          targetProfileKey: nextTarget,
                          resolvedTargetProfileKey: nextTarget || inferTargetProfile(pageState.platform)
                        }
                      : current
                  )
                }}>
                <option value="">Automatic</option>
                <option value="chatgpt_planning">ChatGPT planning</option>
                <option value="claude_code_build">Claude build</option>
                <option value="codex_implementation">Codex build</option>
                <option value="perplexity_research">Perplexity research</option>
              </select>
            </label>

            <div className={styles.inlineRow}>
              <button className={styles.secondaryButton} disabled={busy || !session.projectId || !pageState.supported} onClick={() => void captureManually()}>
                Force capture
              </button>
              <button className={styles.secondaryButton} disabled={busy} onClick={() => void refreshRemoteSession()}>
                Refresh session
              </button>
            </div>
          </details>
        </>
      )}

      <section className={styles.statusCard}>
        <p className={styles.sectionLabel}>Status</p>
        <p className={styles.statusText}>{status}</p>
        {session?.connected ? (
          <p className={styles.hint}>
            {session.targetMode === "manual" ? "Manual target override" : "Automatic target"}: {resolvedTargetLabel}
          </p>
        ) : null}
        {session?.stateStatus?.digestErrorMessage ? <p className={styles.hint}>{session.stateStatus.digestErrorMessage}</p> : null}
        {session?.limitedMode ? <p className={styles.hint}>Gemini was unavailable or rate-limited, so Relay fell back to a bounded deterministic packet.</p> : null}
      </section>
    </div>
  )
}
