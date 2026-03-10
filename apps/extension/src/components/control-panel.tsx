import { useEffect, useState } from "react"

import { setRelaySession, getRelaySession } from "../storage/session"
import { getActiveTab } from "../utils/browser"

interface ControlPanelProps {
  compact?: boolean
}

export function ControlPanel({ compact = false }: ControlPanelProps) {
  const [projectId, setProjectId] = useState("project-relay-mvp")
  const [targetProfileKey, setTargetProfileKey] = useState("claude_code_build")
  const [status, setStatus] = useState("Ready")
  const [pageState, setPageState] = useState("Waiting for a supported tab.")

  useEffect(() => {
    void (async () => {
      const session = await getRelaySession()
      setProjectId(session.projectId)
      setTargetProfileKey(session.targetProfileKey)

      const tab = await getActiveTab()
      if (!tab?.id) return

      const state = await chrome.tabs.sendMessage(tab.id, { type: "RELAY_PAGE_STATE" })
      if (state?.supported) {
        setPageState(`${state.platform} · ${state.turns} visible turns`)
      } else {
        setPageState("Open ChatGPT, Claude, or Perplexity to activate Relay.")
      }
    })()
  }, [])

  async function bindProject() {
    const tab = await getActiveTab()
    if (!tab?.id) return

    await setRelaySession({ projectId, targetProfileKey })
    await chrome.runtime.sendMessage({
      type: "RELAY_BIND_PROJECT",
      payload: {
        projectId,
        tabId: String(tab.id),
        domain: tab.url ? new URL(tab.url).hostname : null
      }
    })
    setStatus("Project bound to this tab.")
  }

  async function capture() {
    const tab = await getActiveTab()
    if (!tab?.id) return

    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "RELAY_CAPTURE_VISIBLE",
      payload: { projectId }
    })
    setStatus(result?.ok ? `Captured ${result.turns} turns.` : result?.reason ?? "Capture failed.")
  }

  async function composeAndInsert() {
    const tab = await getActiveTab()
    if (!tab?.id) return

    const composed = await chrome.runtime.sendMessage({
      type: "RELAY_COMPOSE_CONTEXT",
      payload: { projectId, targetProfileKey }
    })

    const content = composed?.packet?.content ?? composed?.packet?.packet?.content
    if (!content) {
      setStatus("Context composition failed.")
      return
    }

    const inserted = await chrome.tabs.sendMessage(tab.id, {
      type: "RELAY_INSERT_CONTEXT",
      payload: { content }
    })

    setStatus(inserted?.ok ? "Context inserted into prompt." : inserted?.reason ?? "Insert failed.")
  }

  return (
    <div className={`rounded-[24px] bg-stone-950 p-5 text-stone-50 ${compact ? "w-[360px]" : "min-h-screen"}`}>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Relay</p>
        <h1 className="text-2xl font-semibold tracking-tight">Cross-tool project memory</h1>
        <p className="text-sm leading-6 text-stone-300">{pageState}</p>
      </div>

      <div className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="mb-2 block text-stone-300">Project ID</span>
          <input
            className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-stone-50 outline-none"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-2 block text-stone-300">Target profile</span>
          <select
            className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-stone-50 outline-none"
            value={targetProfileKey}
            onChange={(event) => setTargetProfileKey(event.target.value)}>
            <option value="claude_code_build">Claude Code</option>
            <option value="codex_implementation">Codex</option>
            <option value="chatgpt_planning">ChatGPT Planning</option>
            <option value="perplexity_research">Perplexity Research</option>
          </select>
        </label>
      </div>

      <div className="mt-8 grid gap-3">
        <button className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-stone-950" onClick={() => void bindProject()}>
          Bind tab to project
        </button>
        <button className="rounded-full border border-white/20 px-4 py-3 text-sm font-semibold" onClick={() => void capture()}>
          Capture visible turns
        </button>
        <button className="rounded-full border border-white/20 px-4 py-3 text-sm font-semibold" onClick={() => void composeAndInsert()}>
          Compose and insert context
        </button>
      </div>

      <div className="mt-8 rounded-2xl bg-white/8 p-4 text-sm leading-6 text-stone-300">
        <p className="font-medium text-stone-100">Status</p>
        <p className="mt-2">{status}</p>
      </div>
    </div>
  )
}
