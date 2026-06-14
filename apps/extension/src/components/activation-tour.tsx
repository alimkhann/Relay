import { useEffect, useState } from "react"

import { getRelaySession } from "../storage/session"
import styles from "./activation-tour.module.css"

const KEY_INSERT = "relay.firstBriefInsertedAt"
const KEY_AGENT = "relay.firstAgentMessageAt"
const KEY_DISMISSED = "relay.tour.dismissedAt"

interface TourState {
  loaded: boolean
  connected: boolean
  hasProject: boolean
  captured: boolean
  inserted: boolean
  agentUsed: boolean
  dismissed: boolean
}

const EMPTY: TourState = {
  loaded: false,
  connected: false,
  hasProject: false,
  captured: false,
  inserted: false,
  agentUsed: false,
  dismissed: false,
}

/**
 * Activation tour — a dismissible, state-driven checklist that walks a new user
 * through the real aha sequence (capture → insert brief → ask the agent). It
 * advances on actual signals, not timers: capture from the session's saved-
 * context count, insert + agent from one-time chrome.storage flags written by
 * the insertion controller (W4) and the chat hook. Hidden once all three are
 * done or the user dismisses it.
 */
export function ActivationTour() {
  const [s, setS] = useState<TourState>(EMPTY)

  useEffect(() => {
    let cancelled = false
    const area = typeof chrome !== "undefined" ? chrome.storage?.local : null

    async function refresh() {
      const session = await getRelaySession()
      const flags = area ? await area.get([KEY_INSERT, KEY_AGENT, KEY_DISMISSED]) : {}
      if (cancelled) return
      setS({
        loaded: true,
        connected: session.connected,
        hasProject: Boolean(session.projectId) || (session.projectOptions?.length ?? 0) > 0,
        captured: (session.trust?.savedContextCount ?? 0) > 0,
        inserted: Boolean(flags[KEY_INSERT]),
        agentUsed: Boolean(flags[KEY_AGENT]),
        dismissed: Boolean(flags[KEY_DISMISSED]),
      })
    }

    void refresh()
    const onChange = () => void refresh()
    chrome.storage?.onChanged?.addListener(onChange)
    return () => {
      cancelled = true
      chrome.storage?.onChanged?.removeListener(onChange)
    }
  }, [])

  function dismiss() {
    const area = typeof chrome !== "undefined" ? chrome.storage?.local : null
    void area?.set({ [KEY_DISMISSED]: new Date().toISOString() })
    setS((p) => ({ ...p, dismissed: true }))
  }

  if (!s.loaded || !s.connected || !s.hasProject || s.dismissed) return null
  if (s.captured && s.inserted && s.agentUsed) return null

  const steps = [
    {
      done: s.captured,
      title: "Capture your first context",
      hint: "Open any AI chat — Relay saves decisions and tasks as you work.",
    },
    {
      done: s.inserted,
      title: "Insert your brief",
      hint: "Open a fresh AI chat and click Insert Brief to drop in your full project context.",
    },
    {
      done: s.agentUsed,
      title: "Ask the Relay agent",
      hint: "Use the chat below to ask Relay anything about your project.",
    },
  ]
  const nextIdx = steps.findIndex((st) => !st.done)
  const completed = steps.filter((st) => st.done).length

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Get the most from Relay</span>
        <span className={styles.progress}>{completed}/3</span>
        <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Dismiss">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="1" y1="1" x2="11" y2="11" />
            <line x1="11" y1="1" x2="1" y2="11" />
          </svg>
        </button>
      </div>
      <ul className={styles.steps}>
        {steps.map((st, i) => (
          <li
            key={st.title}
            className={`${styles.step} ${st.done ? styles.stepDone : i === nextIdx ? styles.stepActive : ""}`}
          >
            <span className={styles.check}>
              {st.done ? (
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 7.5L5.5 11L12 3.5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <div className={styles.stepText}>
              <p className={styles.stepTitle}>{st.title}</p>
              {i === nextIdx && !st.done ? <p className={styles.stepHint}>{st.hint}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
