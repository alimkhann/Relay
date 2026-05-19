import { useCallback, useEffect, useRef, useState } from "react"

import type { AssistantStreamEvent } from "@relay/shared"

import { getRelaySession } from "../storage/session"
import { getActiveTab } from "../utils/browser"
import styles from "./extension-chat.module.css"

interface ChatMsg {
  id: string
  role: "user" | "assistant"
  content: string
  tool?: string | null
}

const MIN_H = 140
const clampHeight = (h: number) => {
  const max = Math.round(window.innerHeight * 0.5) // ≤ 50% of the sidebar
  return Math.max(MIN_H, Math.min(h, max))
}

let seq = 0
const uid = () => `m${(seq += 1)}`

export function ExtensionChat() {
  const [collapsed, setCollapsed] = useState(true)
  const [height, setHeight] = useState(() => clampHeight(320))
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const chatIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, streaming, activeTool])

  useEffect(() => {
    const onResize = () => setHeight((h) => clampHeight(h))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const move = (ev: MouseEvent) => setHeight(clampHeight(startH + (startY - ev.clientY)))
    const up = () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", up)
    }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
  }

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || streaming) return
    setDraft("")
    setError(null)
    setMessages((m) => [...m, { id: uid(), role: "user", content: text }])
    const asstId = uid()
    setMessages((m) => [...m, { id: asstId, role: "assistant", content: "" }])
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller
    try {
      const session = await getRelaySession()
      const tab = await getActiveTab().catch(() => null)
      const res = await fetch(`${session.apiBase}/api/assistant/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(session.token ? { authorization: `Bearer ${session.token}` } : {})
        },
        body: JSON.stringify({
          message: text,
          surface: "extension",
          chatId: chatIdRef.current,
          pageContext: tab ? { url: tab.url, title: tab.title } : undefined
        })
      })
      if (!res.ok || !res.body) {
        setError("Relay is unavailable right now.")
        setStreaming(false)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? ""
        for (const frame of frames) {
          const line = frame.trim()
          if (!line.startsWith("data:")) continue
          let ev: AssistantStreamEvent
          try {
            ev = JSON.parse(line.slice(5).trim())
          } catch {
            continue
          }
          if (ev.type === "chat") {
            chatIdRef.current = ev.chatId
          } else if (ev.type === "text") {
            const delta = ev.delta
            setMessages((m) =>
              m.map((x) => (x.id === asstId ? { ...x, content: x.content + delta } : x))
            )
          } else if (ev.type === "tool_start") {
            setActiveTool(ev.tool)
          } else if (ev.type === "tool_result") {
            setActiveTool(null)
          } else if (ev.type === "error") {
            setError(ev.message)
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) setError("Connection lost. Please try again.")
    } finally {
      setActiveTool(null)
      setStreaming(false)
      abortRef.current = null
    }
  }, [draft, streaming])

  if (collapsed) {
    return (
      <button
        type="button"
        className={styles.reopen}
        onClick={() => setCollapsed(false)}
        aria-label="Open Relay chat"
      >
        ✦ Ask Relay
      </button>
    )
  }

  return (
    <div className={styles.root} style={{ height }}>
      <div className={styles.resizer} onMouseDown={startDrag} aria-hidden />
      <header className={styles.header}>
        <span className={styles.title}>✦ Relay</span>
        <div className={styles.headBtns}>
          <button
            type="button"
            onClick={() => {
              chatIdRef.current = null
              setMessages([])
              setError(null)
            }}
            className={styles.headBtn}
          >
            New
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className={styles.headBtn}
            aria-label="Hide chat"
          >
            ✕
          </button>
        </div>
      </header>

      <div ref={scrollRef} className={styles.scroll}>
        {messages.length === 0 ? (
          <p className={styles.empty}>Ask about your work on this page.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? styles.userMsg : styles.asstMsg}
            >
              {m.content || (m.role === "assistant" && streaming ? "…" : "")}
            </div>
          ))
        )}
        {activeTool ? (
          <div className={styles.tool}>Running {activeTool.replace(/_/g, " ")}…</div>
        ) : null}
        {error ? <div className={styles.error}>{error}</div> : null}
      </div>

      <div className={styles.composer}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={1}
          placeholder="Ask anything…"
          className={styles.input}
        />
        {streaming ? (
          <button type="button" onClick={stop} className={styles.stopBtn} aria-label="Stop">
            ■
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim()}
            className={styles.sendBtn}
            aria-label="Send"
          >
            ↑
          </button>
        )}
      </div>
    </div>
  )
}
