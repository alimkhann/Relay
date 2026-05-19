import React, { useCallback, useEffect, useRef, useState } from "react"

import type { AssistantActionResult, UiMessage } from "@relay/shared"

import { MiniMarkdown } from "../utils/mini-markdown"
import styles from "./extension-chat.module.css"
import { useExtensionChat, type ExtChatSummary } from "./use-extension-chat"

const MIN_H = 160
const clampHeight = (h: number) => {
  const max = Math.round(window.innerHeight * 0.5) // ≤ 50% of the sidebar
  return Math.max(MIN_H, Math.min(h, max))
}

const MUTATION_CHANNEL = "relay-mutations"

function ActionChip({ r }: { r: AssistantActionResult }) {
  const verb =
    r.action === "created"
      ? "✚"
      : r.action === "deleted"
        ? "🗑"
        : r.action === "updated"
          ? "✎"
          : "•"
  return (
    <span className={styles.toolChip}>
      {verb} {r.action} {r.count} {r.entity}
      {r.count === 1 ? "" : "s"}
    </span>
  )
}

function MessageRow({
  m,
  onEdit,
  onConfirm,
  onSelectBranch,
  streaming
}: {
  m: UiMessage
  onEdit: (m: UiMessage, text: string) => void
  onConfirm: (a: NonNullable<UiMessage["pending"]>) => void
  onSelectBranch: (parentId: string | null, siblingId: string) => void
  streaming: boolean
}) {
  const isUser = m.role === "user"
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.content)
  const branch = m.branch

  const cycle = (dir: -1 | 1) => {
    if (!branch) return
    const next = branch.index - 1 + dir
    const target = branch.siblingIds[next]
    if (next < 0 || next >= branch.total || !target) return
    onSelectBranch(m.parentId, target)
  }

  return (
    <div className={`${styles.msgRow} ${isUser ? styles.user : ""}`}>
      {editing ? (
        <div className={styles.editArea}>
          <textarea
            value={draft}
            rows={3}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className={styles.editBtns}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => {
                setEditing(false)
                setDraft(m.content)
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={() => {
                if (draft.trim()) {
                  onEdit(m, draft)
                  setEditing(false)
                }
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : m.content ? (
        isUser ? (
          <div className={styles.userMsg}>{m.content}</div>
        ) : (
          <div className={styles.asstMsg}>
            <MiniMarkdown text={m.content} />
          </div>
        )
      ) : null}

      {m.actionResults.map((r, i) => (
        <ActionChip key={i} r={r} />
      ))}

      {m.pending ? (
        <div className={styles.pending}>
          Confirm to <strong>{m.pending.summary}</strong>?
          <div>
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={() => m.pending && onConfirm(m.pending)}
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}

      {!editing && !m.streaming ? (
        <div className={styles.msgTools}>
          {branch ? (
            <span className={styles.branchNav}>
              <button type="button" className={styles.iconBtn} onClick={() => cycle(-1)}>
                ‹
              </button>
              {branch.index}/{branch.total}
              <button type="button" className={styles.iconBtn} onClick={() => cycle(1)}>
                ›
              </button>
            </span>
          ) : null}
          {isUser && !streaming ? (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => {
                setDraft(m.content)
                setEditing(true)
              }}
            >
              Edit
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function ExtensionChat() {
  const [collapsed, setCollapsed] = useState(true)
  const [height, setHeight] = useState(() => clampHeight(340))
  const [draft, setDraft] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chats, setChats] = useState<ExtChatSummary[]>([])
  const [chatQuery, setChatQuery] = useState("")
  const [projectId, setProjectId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const chat = useExtensionChat({
    onMutation: () => {
      try {
        const bc = new BroadcastChannel(MUTATION_CHANNEL)
        bc.postMessage({ type: "memory-mutated", at: Date.now() })
        bc.close()
      } catch {
        /* BroadcastChannel unavailable */
      }
      window.dispatchEvent(new CustomEvent("relay:memory-mutated"))
    }
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [chat.messages, chat.streaming, chat.activeTool])

  useEffect(() => {
    const onResize = () => setHeight((h) => clampHeight(h))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    void chat.listProjects().then((p) => setProjectId(p[0]?.id ?? null))
  }, [chat])

  useEffect(() => {
    if (!historyOpen) return
    const t = setTimeout(() => {
      void chat.listChats(chatQuery.trim() || undefined).then(setChats)
    }, chatQuery ? 250 : 0)
    return () => clearTimeout(t)
  }, [historyOpen, chatQuery, chat])

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

  const submit = useCallback(() => {
    if (!draft.trim() || chat.streaming) return
    chat.send(draft)
    setDraft("")
  }, [draft, chat])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) void chat.addFiles(files)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files)
    if (files.length > 0) {
      e.preventDefault()
      void chat.addFiles(files)
    }
  }

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
    <div
      className={styles.root}
      style={{ height }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      <div className={styles.resizer} onMouseDown={startDrag} aria-hidden />
      {dragOver ? <div className={styles.dropHint}>Drop files to attach</div> : null}

      {historyOpen ? (
        <div className={styles.history}>
          <header className={styles.header}>
            <span className={styles.title}>Your chats</span>
            <button
              type="button"
              className={styles.headBtn}
              onClick={() => setHistoryOpen(false)}
            >
              ✕
            </button>
          </header>
          <input
            className={styles.searchInput}
            value={chatQuery}
            placeholder="Search chats…"
            onChange={(e) => setChatQuery(e.target.value)}
          />
          <div style={{ flex: 1, overflowY: "auto" }}>
            {chats.length === 0 ? (
              <p className={styles.empty}>No chats yet.</p>
            ) : (
              chats.map((c) => (
                <div key={c.id} className={styles.historyRow}>
                  <span
                    style={{ flex: 1 }}
                    onClick={() => {
                      void chat.loadChat(c.id)
                      setHistoryOpen(false)
                    }}
                  >
                    {c.title}
                  </span>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => {
                      const t = window.prompt("Rename chat", c.title)
                      if (t && t.trim()) {
                        void chat.renameChat(c.id, t.trim())
                        setChats((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, title: t.trim() } : x))
                        )
                      }
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => {
                      void chat.deleteChat(c.id)
                      setChats((prev) => prev.filter((x) => x.id !== c.id))
                    }}
                  >
                    🗑
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      <header className={styles.header}>
        <span className={styles.title}>✦ Relay</span>
        <div className={styles.headBtns}>
          <button type="button" className={styles.headBtn} onClick={chat.reset}>
            New
          </button>
          <button
            type="button"
            className={styles.headBtn}
            onClick={() => setHistoryOpen(true)}
          >
            History
          </button>
          <button
            type="button"
            className={styles.headBtn}
            onClick={() => setCollapsed(true)}
            aria-label="Hide chat"
          >
            ✕
          </button>
        </div>
      </header>

      <div ref={scrollRef} className={styles.scroll}>
        {chat.messages.length === 0 ? (
          <p className={styles.empty}>Ask about your work on this page.</p>
        ) : (
          chat.messages.map((m) => (
            <MessageRow
              key={m.id}
              m={m}
              streaming={chat.streaming}
              onEdit={chat.editMessage}
              onConfirm={chat.confirmAction}
              onSelectBranch={chat.selectBranch}
            />
          ))
        )}
        {chat.activeTool ? (
          <div className={styles.tool}>Running {chat.activeTool.replace(/_/g, " ")}…</div>
        ) : null}
        {chat.error ? <div className={styles.error}>{chat.error}</div> : null}
      </div>

      <div className={styles.composer}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) void chat.addFiles(files)
            e.target.value = ""
          }}
        />
        <div style={{ flex: 1 }}>
          {chat.attachments.length > 0 ? (
            <div className={styles.chips}>
              {chat.attachments.map((a) => (
                <span key={a.id} className={styles.chip}>
                  {a.uploading ? "⏳" : a.mime.startsWith("image/") ? "🖼" : "📄"}{" "}
                  {a.fileName.slice(0, 18)}
                  {projectId && !a.uploading ? (
                    <button
                      type="button"
                      title={a.savedToRelay ? "Saved to Sources" : "Save to Sources"}
                      disabled={a.savedToRelay || a.saving}
                      onClick={() =>
                        !a.savedToRelay && chat.saveAttachmentToSources(a.id, projectId)
                      }
                    >
                      {a.saving ? "…" : a.savedToRelay ? "✓" : "⤓"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => chat.removeAttachment(a.id)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder="Ask anything…"
            className={styles.input}
          />
        </div>
        <button
          type="button"
          className={styles.attachBtn}
          aria-label="Attach files"
          onClick={() => fileInputRef.current?.click()}
        >
          ＋
        </button>
        {chat.streaming ? (
          <button
            type="button"
            onClick={chat.stop}
            className={styles.stopBtn}
            aria-label="Stop"
          >
            ■
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
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
