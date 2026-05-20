import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  History,
  ImageIcon,
  Maximize,
  Maximize2,
  Minimize2,
  Paperclip,
  Pencil,
  PencilLine,
  Plus,
  Search,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Undo2,
  X,
  type LucideIcon
} from "lucide-react"

import type { AssistantActionResult, UiMessage } from "@relay/shared"

import { MiniMarkdown } from "../utils/mini-markdown"
import styles from "./extension-chat.module.css"
import { useExtensionChat, type ExtChatSummary } from "./use-extension-chat"
import { useResolvedTheme } from "./use-resolved-theme"

const MUTATION_CHANNEL = "relay-mutations"
const MIN_H = 160

type SizeMode = "half" | "tall" | "full"

const ICON_BY_TOOL: Record<string, LucideIcon> = {
  add_memory: Sparkles,
  manage_memory: PencilLine,
  search_memory: Search,
  list_projects: FileText,
  recall_context: Sparkles,
  list_recent_activity: Sparkles,
  get_brief: FileText,
  relay_knowledge: FileText,
  recall_past_chats: History,
  list_sources: FileText,
  search_sources: Search,
  read_source: FileText,
  explore_sources: FileText,
  grep_sources: Search,
  import_source_citation: Sparkles,
  refresh_source: Sparkles,
  get_project_state: FileText,
  set_project_state: PencilLine,
  trace_context: Sparkles,
  save_context: Sparkles,
  web_search: Sparkles
}

function toolIconFor(tool: string | null | undefined): LucideIcon {
  if (!tool) return Sparkles
  return ICON_BY_TOOL[tool] ?? Sparkles
}

function toolLabelFor(tool: string): string {
  const map: Record<string, string> = {
    list_projects: "Listing projects",
    recall_context: "Recalling context",
    search_memory: "Searching memory",
    list_recent_activity: "Reading activity",
    get_brief: "Building brief",
    add_memory: "Saving to memory",
    manage_memory: "Updating memory",
    relay_knowledge: "Checking Relay docs",
    recall_past_chats: "Recalling past chats",
    list_sources: "Listing sources",
    search_sources: "Searching sources",
    read_source: "Reading source",
    explore_sources: "Exploring sources",
    grep_sources: "Grepping sources",
    import_source_citation: "Promoting citation",
    refresh_source: "Refreshing source",
    get_project_state: "Reading project state",
    set_project_state: "Updating project state",
    trace_context: "Tracing context",
    save_context: "Saving checkpoint",
    web_search: "Searching the web"
  }
  return map[tool] ?? `Running ${tool.replace(/_/g, " ")}`
}

function ActionCard({ r }: { r: AssistantActionResult }) {
  const ToolGlyph = toolIconFor(r.tool)
  const ActionGlyph =
    r.action === "deleted"
      ? Trash2
      : r.action === "updated"
        ? PencilLine
        : r.action === "created"
          ? CheckCircle2
          : CheckCircle2
  const verb =
    r.action === "created"
      ? "Created"
      : r.action === "updated"
        ? "Updated"
        : r.action === "deleted"
          ? "Deleted"
          : "Read"
  return (
    <div className={styles.actionCard}>
      <div className={styles.actionHeader}>
        <span className={styles.actionGlyph}>
          <ToolGlyph size={11} />
        </span>
        <ActionGlyph size={12} />
        <span>
          {verb} {r.count} {r.entity}
          {r.count === 1 ? "" : "s"}
        </span>
      </div>
      {r.items.length > 0 ? (
        <ul className={styles.actionItems}>
          {r.items.slice(0, 5).map((item, i) => {
            const isUrl =
              typeof item.id === "string" && /^https?:\/\//i.test(item.id)
            return (
              <li key={item.id ?? i} className={styles.actionItem}>
                <span style={{ color: "var(--ec-muted)" }}>—</span>
                {isUrl ? (
                  <a href={item.id} target="_blank" rel="noopener noreferrer">
                    {item.label}
                  </a>
                ) : (
                  <span>{item.label}</span>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function ThinkingChip({ tool }: { tool: string | null }) {
  const Icon = toolIconFor(tool)
  return (
    <div className={styles.thinking}>
      <span className={styles.thinkingDot}>
        <Icon size={11} />
      </span>
      <span>{tool ? `${toolLabelFor(tool)}…` : "Thinking…"}</span>
    </div>
  )
}

function MessageRow({
  m,
  onEdit,
  onConfirm,
  onSelectBranch,
  onCopy,
  onFeedback,
  streaming
}: {
  m: UiMessage
  onEdit: (m: UiMessage, text: string) => void
  onConfirm: (a: NonNullable<UiMessage["pending"]>) => void
  onSelectBranch: (parentId: string | null, siblingId: string) => void
  onCopy: (text: string) => void
  onFeedback: (id: string, value: "like" | "dislike" | null) => void
  streaming: boolean
}) {
  const isUser = m.role === "user"
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.content)
  const [copied, setCopied] = useState(false)
  const branch = m.branch

  const cycle = (dir: -1 | 1) => {
    if (!branch) return
    const next = branch.index - 1 + dir
    const target = branch.siblingIds[next]
    if (next < 0 || next >= branch.total || !target) return
    onSelectBranch(m.parentId, target)
  }

  const copyHandler = () => {
    onCopy(m.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
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
        <ActionCard key={i} r={r} />
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
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => cycle(-1)}
                aria-label="Previous branch"
              >
                <ChevronLeft size={12} />
              </button>
              {branch.index}/{branch.total}
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => cycle(1)}
                aria-label="Next branch"
              >
                <ChevronRight size={12} />
              </button>
            </span>
          ) : null}
          {m.content ? (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={copyHandler}
              aria-label="Copy"
              title={copied ? "Copied" : "Copy"}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          ) : null}
          {isUser && !streaming ? (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => {
                setDraft(m.content)
                setEditing(true)
              }}
              aria-label="Edit"
              title="Edit"
            >
              <Pencil size={12} />
            </button>
          ) : null}
          {!isUser ? (
            <>
              <button
                type="button"
                className={`${styles.iconBtn} ${m.feedback === "like" ? styles.iconBtnActive : ""}`}
                onClick={() => onFeedback(m.id, m.feedback === "like" ? null : "like")}
                aria-label="Helpful"
                title="Helpful"
              >
                <ThumbsUp size={12} />
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${m.feedback === "dislike" ? styles.iconBtnActive : ""}`}
                onClick={() => onFeedback(m.id, m.feedback === "dislike" ? null : "dislike")}
                aria-label="Not helpful"
                title="Not helpful"
              >
                <ThumbsDown size={12} />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function ExtensionChat() {
  const [collapsed, setCollapsed] = useState(true)
  const [mode, setMode] = useState<SizeMode>("half")
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 340 : Math.round(window.innerHeight * 0.5)
  )
  const [draft, setDraft] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chats, setChats] = useState<ExtChatSummary[]>([])
  const [chatQuery, setChatQuery] = useState("")
  const [projectId, setProjectId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const theme = useResolvedTheme()

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

  // Auto-scroll on new content and active-tool transitions.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    })
  }, [chat.messages, chat.streaming, chat.activeTool])

  // Recompute height bounds when the side panel resizes.
  useEffect(() => {
    const onResize = () => setHeight((h) => Math.max(MIN_H, Math.min(h, modeMaxHeight(mode))))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [mode])

  // Snap to the new mode's natural height when switching.
  useEffect(() => {
    if (mode === "full") return
    const target = mode === "tall" ? Math.round(window.innerHeight * 0.8) : Math.round(window.innerHeight * 0.5)
    setHeight(Math.max(MIN_H, target))
  }, [mode])

  // Only enable Save-to-Sources when the target is unambiguous (exactly one
  // project) — never silently route an attachment into projects[0].
  useEffect(() => {
    void chat.listProjects().then((p) => setProjectId(p.length === 1 ? p[0]!.id : null))
  }, [chat])

  useEffect(() => {
    if (!historyOpen) return
    const t = setTimeout(() => {
      void chat.listChats(chatQuery.trim() || undefined).then(setChats)
    }, chatQuery ? 250 : 0)
    return () => clearTimeout(t)
  }, [historyOpen, chatQuery, chat])

  const startDrag = (e: React.MouseEvent) => {
    if (mode === "full") return
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const max = modeMaxHeight(mode)
    const move = (ev: MouseEvent) =>
      setHeight(Math.max(MIN_H, Math.min(startH + (startY - ev.clientY), max)))
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

  const cycleMode = useCallback(() => {
    setMode((prev) => (prev === "half" ? "tall" : prev === "tall" ? "half" : "half"))
  }, [])

  const toggleFull = useCallback(() => {
    setMode((prev) => (prev === "full" ? "half" : "full"))
  }, [])

  const modeClass =
    mode === "full" ? styles.modeFull : mode === "tall" ? styles.modeTall : styles.modeHalf
  const computedStyle =
    mode === "full" ? undefined : { height }

  const wrapperRef = useRef<HTMLDivElement>(null)

  if (collapsed) {
    return (
      <button
        type="button"
        className={styles.reopen}
        data-theme={theme}
        onClick={() => setCollapsed(false)}
        aria-label="Open Relay chat"
      >
        <Sparkles size={14} /> Ask Relay
      </button>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className={`${styles.root} ${modeClass}`}
      data-theme={theme}
      style={computedStyle}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      {mode !== "full" ? (
        <div className={styles.resizer} onMouseDown={startDrag} aria-hidden />
      ) : null}
      {dragOver ? <div className={styles.dropHint}>Drop files to attach</div> : null}

      {historyOpen ? (
        <div className={styles.history}>
          <header className={styles.header}>
            <span className={styles.titleRow}>
              <Sparkles size={14} className={styles.titleIcon} />
              Your chats
            </span>
            <button
              type="button"
              className={styles.headBtn}
              onClick={() => setHistoryOpen(false)}
              aria-label="Close history"
            >
              <X size={14} />
            </button>
          </header>
          <div className={styles.searchRow}>
            <Search size={12} style={{ color: "var(--ec-muted)" }} />
            <input
              className={styles.searchInput}
              value={chatQuery}
              placeholder="Search chats…"
              onChange={(e) => setChatQuery(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
            {chats.length === 0 ? (
              <p className={styles.empty}>No chats yet.</p>
            ) : (
              chats.map((c) => (
                <div
                  key={c.id}
                  className={`${styles.historyRow} ${c.id === chat.chatId ? styles.historyRowActive : ""}`}
                >
                  <span
                    style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
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
                    aria-label="Rename chat"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation()
                      const t = window.prompt("Rename chat", c.title)
                      if (t && t.trim()) {
                        void chat.renameChat(c.id, t.trim())
                        setChats((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, title: t.trim() } : x))
                        )
                      }
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    aria-label="Delete chat"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      void chat.deleteChat(c.id)
                      setChats((prev) => prev.filter((x) => x.id !== c.id))
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      <header className={styles.header}>
        <span className={styles.titleRow}>
          <Sparkles size={14} className={styles.titleIcon} />
          Relay
        </span>
        <div className={styles.headBtns}>
          <button
            type="button"
            className={styles.headBtn}
            onClick={chat.reset}
            aria-label="New chat"
            title="New chat"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className={styles.headBtn}
            onClick={() => setHistoryOpen(true)}
            aria-label="Chat history"
            title="Chat history"
          >
            <History size={14} />
          </button>
          <button
            type="button"
            className={styles.headBtn}
            onClick={cycleMode}
            aria-label={mode === "tall" ? "Shrink chat" : "Expand chat"}
            title={mode === "tall" ? "Shrink chat (50%)" : "Expand chat (80%)"}
          >
            {mode === "tall" ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            type="button"
            className={styles.headBtn}
            onClick={toggleFull}
            aria-label={mode === "full" ? "Exit full screen" : "Full screen"}
            title={mode === "full" ? "Exit full screen" : "Full screen"}
          >
            <Maximize size={14} />
          </button>
          <button
            type="button"
            className={styles.headBtn}
            onClick={() => setCollapsed(true)}
            aria-label="Hide chat"
            title="Hide chat"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className={styles.scroll}>
        {chat.messages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Sparkles size={16} />
            </span>
            <span className={styles.emptyTitle}>Ask about your work</span>
            <span>Memory, sources, the open page, the web.</span>
          </div>
        ) : (
          chat.messages.map((m) => (
            <MessageRow
              key={m.id}
              m={m}
              streaming={chat.streaming}
              onEdit={chat.editMessage}
              onConfirm={chat.confirmAction}
              onSelectBranch={chat.selectBranch}
              onCopy={(t) => navigator.clipboard?.writeText(t).catch(() => {})}
              onFeedback={chat.setFeedback}
            />
          ))
        )}
        {chat.streaming ? <ThinkingChip tool={chat.activeTool} /> : null}
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
        <button
          type="button"
          className={styles.attachBtn}
          aria-label="Attach files"
          title="Attach files"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={14} />
        </button>
        <div className={styles.inputColumn}>
          {chat.attachments.length > 0 ? (
            <div className={styles.chips}>
              {chat.attachments.map((a) => {
                const isImg = a.mime.startsWith("image/")
                return (
                  <span key={a.id} className={styles.chip}>
                    {a.uploading ? (
                      <Sparkles size={11} />
                    ) : isImg ? (
                      <ImageIcon size={11} />
                    ) : (
                      <FileText size={11} />
                    )}
                    <span className={styles.chipLabel}>{a.fileName}</span>
                    {projectId && !a.uploading ? (
                      <button
                        type="button"
                        title={a.savedToRelay ? "Saved to Sources" : "Save to Sources"}
                        disabled={a.savedToRelay || a.saving}
                        onClick={() =>
                          !a.savedToRelay && chat.saveAttachmentToSources(a.id, projectId)
                        }
                      >
                        {a.savedToRelay ? <Check size={11} /> : <Undo2 size={11} />}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => chat.removeAttachment(a.id)}
                    >
                      <X size={11} />
                    </button>
                  </span>
                )
              })}
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
        {chat.streaming ? (
          <button
            type="button"
            onClick={chat.stop}
            className={styles.stopBtn}
            aria-label="Stop"
            title="Stop"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className={styles.sendBtn}
            aria-label="Send"
            title="Send"
          >
            <ArrowUp size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function modeMaxHeight(mode: SizeMode): number {
  if (typeof window === "undefined") return 600
  if (mode === "full") return window.innerHeight
  if (mode === "tall") return Math.round(window.innerHeight * 0.8)
  return Math.round(window.innerHeight * 0.5)
}
