import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  ArrowUp,
  ArrowDown,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  History,
  ImageIcon,
  Maximize,
  Mic,
  MicOff,
  Minimize,
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
  Zap,
  type LucideIcon
} from "lucide-react"

import type { AssistantActionItem, AssistantActionPreview, AssistantActionResult, AssistantAttachmentDto, UiMessage } from "@relay/shared"
import { filterRenderablePendingActions, shouldRenderPendingAction } from "@relay/shared/utils/assistant-chat-path"

import type { RelayActiveProjectState } from "../messaging/contracts"
import { MiniMarkdown } from "../utils/mini-markdown"
import { getActiveTab } from "../utils/browser"
import { getRelaySession } from "../storage/session"
import styles from "./extension-chat.module.css"
import { useExtensionChat, type ExtChatSummary } from "./use-extension-chat"
import { useResolvedTheme } from "./use-resolved-theme"
import { openMicrophonePermissionTab, useVoiceInput } from "./use-voice-input"
import { VoiceRing } from "./voice-ring"

const MUTATION_CHANNEL = "relay-mutations"
const MIN_H = 200

function isActiveProjectState(value: unknown): value is RelayActiveProjectState {
  return Boolean(
    value &&
      typeof value === "object" &&
      "projectId" in value &&
      Array.isArray((value as RelayActiveProjectState).projectOptions),
  )
}

async function resolveChatProjectId(): Promise<string | null> {
  try {
    const tab = await getActiveTab()
    if (tab?.id) {
      const response = await chrome.runtime.sendMessage({
        type: "RELAY_GET_ACTIVE_PROJECT_STATE",
        payload: { tabId: tab.id },
      })
      if (isActiveProjectState(response) && response.projectId) {
        return response.projectId
      }
    }
  } catch {
    // Fall through to the session snapshot.
  }
  const session = await getRelaySession()
  return session.assumedProjectId || session.projectId || null
}
const TALL_HEIGHT_RATIO = 0.7

// Two visible modes: tall (default, drag-resizable) and full
// (absolute overlay over ControlPanel).
type SizeMode = "tall" | "full"

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

const LIFECYCLE_PILL: Record<
  NonNullable<AssistantActionItem["lifecycle"]>,
  { label: string; bg: string; fg: string }
> = {
  active: { label: "active", bg: "rgba(16,185,129,0.12)", fg: "#10b981" },
  cooling: { label: "cooling", bg: "rgba(245,158,11,0.12)", fg: "#f59e0b" },
  archived: { label: "archived", bg: "rgba(113,113,122,0.16)", fg: "#a1a1aa" },
  forgotten: { label: "forgotten", bg: "rgba(244,63,94,0.12)", fg: "#f43f5e" },
}

function MemoryPreview({ preview }: { preview: AssistantActionPreview }) {
  const render = (item: AssistantActionItem, deleted = false) => (
    <div className={`${styles.memoryPreview} ${deleted ? styles.memoryPreviewDeleted : ""}`}>
      <div className={styles.memoryPreviewMeta}>
        {item.type ?? "memory"}{item.personalCategory ? ` · ${item.personalCategory}` : ""}
      </div>
      <div className={deleted ? styles.memoryPreviewStrike : ""}>{item.content ?? item.label}</div>
    </div>
  )
  if (preview.before && preview.after) {
    const same =
      (preview.before.content ?? preview.before.label) ===
        (preview.after.content ?? preview.after.label) &&
      (preview.before.title ?? "") === (preview.after.title ?? "")
    if (same) return render(preview.after)
    return (
      <div className={styles.memoryPreviewStack}>
        {render(preview.before)}
        <ArrowDown size={12} />
        {render(preview.after)}
      </div>
    )
  }
  if (preview.before) return render(preview.before, true)
  if (preview.after) return render(preview.after)
  return null
}

function ActionCard({
  r,
  onUndo,
}: {
  r: AssistantActionResult
  onUndo?: (r: AssistantActionResult) => Promise<boolean>
}) {
  const [undone, setUndone] = useState(false)
  const [undoing, setUndoing] = useState(false)
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
          {undone ? `${r.entity} (undone)` : `${verb} ${r.count} ${r.entity}${r.count === 1 ? "" : "s"}`}
        </span>
        {r.undoRef && onUndo && !undone ? (
          <button
            type="button"
            disabled={undoing}
            onClick={async () => {
              setUndoing(true)
              const ok = await onUndo(r)
              setUndoing(false)
              if (ok) setUndone(true)
            }}
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              cursor: undoing ? "default" : "pointer",
              color: "var(--ec-muted)",
              fontSize: 11,
              padding: 0,
            }}
          >
            <Undo2 size={12} />
            {undoing ? "Undoing…" : "Undo"}
          </button>
        ) : r.irreversible && !undone ? (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ec-muted)" }}>
            Can&apos;t be undone
          </span>
        ) : null}
      </div>
      {r.items.length > 0 ? (
        <ul className={styles.actionItems}>
          {r.items.slice(0, 5).map((item, i) => {
            const isUrl =
              typeof item.id === "string" && /^https?:\/\//i.test(item.id)
            const pill = item.lifecycle ? LIFECYCLE_PILL[item.lifecycle] : null
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
                {pill ? (
                  <span
                    style={{
                      flexShrink: 0,
                      borderRadius: 999,
                      padding: "1px 6px",
                      fontSize: 10,
                      fontWeight: 500,
                      background: pill.bg,
                      color: pill.fg,
                    }}
                  >
                    {pill.label}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {r.previews?.slice(0, 3).map((preview, index) => (
        <MemoryPreview key={index} preview={preview} />
      ))}
    </div>
  )
}

function Waveform({ still = false, levels }: { still?: boolean; levels?: number[] }) {
  const bars = levels && levels.length > 0 ? levels : new Array(9).fill(0.22)
  return (
    <span className={`${styles.wave} ${styles.waveReactive} ${still ? styles.waveStill : ""}`} aria-hidden>
      {bars.map((level, i) => (
        <span
          key={i}
          style={{
            height: still ? "22%" : `${Math.max(12, Math.min(100, level * 100))}%`
          }}
        />
      ))}
    </span>
  )
}

function ThinkingChip({ tool }: { tool: string | null }) {
  const Icon = toolIconFor(tool)
  return (
    <div className={styles.thinking}>
      <span className={styles.thinkingDot}>
        <Icon size={11} />
      </span>
      <span className={styles.thinkingText}>
        {tool ? `${toolLabelFor(tool)}…` : "Thinking…"}
      </span>
    </div>
  )
}

function AttachmentImage({
  id,
  fileName,
  className,
  previewUrl
}: {
  id: string
  fileName: string
  className?: string
  previewUrl?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (previewUrl) {
      setUrl(previewUrl)
      return
    }
    let alive = true
    let objectUrl: string | null = null
    void getRelaySession()
      .then((session) =>
        fetch(`${session.apiBase}/api/assistant/attachments/${id}/content`, {
          headers: session.token ? { authorization: `Bearer ${session.token}` } : {}
        })
      )
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || !alive) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id, previewUrl])

  if (!url) {
    return (
      <span className={className}>
        <ImageIcon size={12} />
      </span>
    )
  }

  return <img src={url} alt={fileName} className={className} />
}

function AttachmentStrip({
  attachments,
  projectId,
  onSave
}: {
  attachments: AssistantAttachmentDto[]
  projectId: string | null
  onSave: (id: string, projectId: string) => Promise<void>
}) {
  const [preview, setPreview] = useState<AssistantAttachmentDto | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  if (attachments.length === 0) return null

  return (
    <>
      <div className={styles.sentAttachments}>
        {attachments.map((a) => {
          const isImg = a.mime.startsWith("image/")
          return (
            <span key={a.id} className={styles.chip}>
              {isImg ? (
                <button
                  type="button"
                  className={styles.thumbButton}
                  onClick={() => setPreview(a)}
                  aria-label={`Preview ${a.fileName}`}
                >
                  <AttachmentImage id={a.id} fileName={a.fileName} className={styles.thumbImg} previewUrl={a.previewUrl} />
                </button>
              ) : (
                <FileText size={11} />
              )}
              <span className={styles.chipLabel}>{a.fileName}</span>
              {projectId && !isImg ? (
                <button
                  type="button"
                  title={a.savedToRelay ? "Saved to Sources" : "Save to Sources"}
                  disabled={a.savedToRelay || savingId === a.id}
                  onClick={async () => {
                    if (a.savedToRelay || savingId) return
                    setSavingId(a.id)
                    await onSave(a.id, projectId)
                    setSavingId(null)
                  }}
                >
                  {a.savedToRelay ? <Check size={11} /> : <Undo2 size={11} />}
                </button>
              ) : null}
            </span>
          )
        })}
      </div>
      {preview ? (
        <div className={styles.previewOverlay} onClick={() => setPreview(null)}>
          <div className={styles.previewFrame} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.previewClose}
              onClick={() => setPreview(null)}
              aria-label="Close preview"
            >
              <X size={14} />
            </button>
            <AttachmentImage
              id={preview.id}
              fileName={preview.fileName}
              className={styles.previewImage}
              previewUrl={preview.previewUrl}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

function MessageRow({
  m,
  onEdit,
  onConfirm,
  onDecline,
  onConfirmAll,
  onDeclineAll,
  onSelectBranch,
  onCopy,
  onFeedback,
  streaming,
  projectId,
  onSaveAttachment,
  onUndo
}: {
  m: UiMessage
  onEdit: (m: UiMessage, text: string) => void
  onConfirm: (a: NonNullable<UiMessage["pending"]>) => void
  onDecline: (a: NonNullable<UiMessage["pending"]>) => void
  onConfirmAll?: (msg: UiMessage) => void
  onDeclineAll?: (msg: UiMessage) => void
  onSelectBranch: (parentId: string | null, siblingId: string) => void
  onCopy: (text: string) => void
  onFeedback: (id: string, value: "like" | "dislike" | null) => void
  streaming: boolean
  projectId: string | null
  onSaveAttachment: (id: string, projectId: string) => Promise<void>
  onUndo?: (r: AssistantActionResult) => Promise<boolean>
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
          <>
            <AttachmentStrip
              attachments={m.attachments}
              projectId={projectId}
              onSave={onSaveAttachment}
            />
            <div className={styles.userMsg}>{m.content}</div>
          </>
        ) : (
          <div className={styles.asstMsg}>
            <MiniMarkdown text={m.content} />
          </div>
        )
      ) : null}

      {m.toolSteps.length > 0 && !m.streaming ? (
        <details className={styles.activityChain}>
          <summary>Tool calls ({m.toolSteps.length})</summary>
          <ol>
            {m.toolSteps.map((step, index) => (
              <li key={`${step.label}-${index}`}>
                <span>{step.label}</span>
                {step.durationMs !== undefined ? <small>{step.durationMs} ms</small> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {m.actionResults.map((r, i) => (
        <ActionCard key={i} r={r} onUndo={onUndo} />
      ))}

      {(() => {
        const renderable = filterRenderablePendingActions(m.pendingActions ?? [])
        const legacySingle = renderable.length === 0 && shouldRenderPendingAction(m.pending, m.actionResults)
          ? m.pending
          : null
        const allPending = renderable.length > 0 ? renderable : legacySingle ? [legacySingle] : []
        if (allPending.length === 0) return null
        const awaitingApproval = allPending.filter((a) => !a.status || a.status === "pending")
        return (
          <>
            {allPending.map((action) => (
              <div
                key={action.id}
                className={`${styles.pending} ${action.status === "failed" ? styles.pendingFailed : ""} ${action.status === "succeeded" ? styles.pendingSucceeded ?? "" : ""}`}
              >
                {action.status === "succeeded"
                  ? "Completed "
                  : action.status === "failed"
                    ? "Failed "
                    : action.status === "running"
                      ? "Running "
                      : "Allow agent to "}
                <strong>{action.summary}</strong>
                {!action.status || action.status === "pending" ? "?" : ""}
                {action.error ? <div className={styles.pendingError}>{action.error}</div> : null}
                {action.previews && action.previews.length > 0 ? (
                  <div className={styles.pendingPreviews}>
                    {action.previews.slice(0, 3).map((preview, index) => (
                      <MemoryPreview key={index} preview={preview} />
                    ))}
                  </div>
                ) : null}
                {!action.status || action.status === "pending" ? (
                  <div className={styles.pendingActions}>
                    <button
                      type="button"
                      className={styles.confirmBtn}
                      onClick={() => onConfirm(action)}
                    >
                      Allow
                    </button>
                    <button
                      type="button"
                      className={styles.declineBtn}
                      onClick={() => onDecline(action)}
                    >
                      Decline
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {awaitingApproval.length > 1 && onConfirmAll && onDeclineAll ? (
              <div className={styles.pendingBulkActions ?? styles.pendingActions}>
                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={() => onConfirmAll(m)}
                >
                  Allow all ({awaitingApproval.length})
                </button>
                <button
                  type="button"
                  className={styles.declineBtn}
                  onClick={() => onDeclineAll(m)}
                >
                  Decline all
                </button>
              </div>
            ) : null}
          </>
        )
      })()}

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
  const [hidden, setHidden] = useState(() => localStorage.getItem("relay:hideAskRelayExtension") === "true")
  const [collapsed, setCollapsed] = useState(true)
  const [mode, setMode] = useState<SizeMode>("tall")
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 600 : Math.round(window.innerHeight * TALL_HEIGHT_RATIO)
  )
  const [draft, setDraft] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chats, setChats] = useState<ExtChatSummary[]>([])
  const [chatQuery, setChatQuery] = useState("")
  const [projectId, setProjectId] = useState<string | null>(null)
  const [composerMenuOpen, setComposerMenuOpen] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0)
  const [previewAttachment, setPreviewAttachment] = useState<{ id: string; fileName: string } | null>(null)
  const [voiceDeniedDismissed, setVoiceDeniedDismissed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const theme = useResolvedTheme()

  const voice = useVoiceInput((text) => setDraft((d) => (d ? `${d} ${text}` : text)))

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "relay:hideAskRelayExtension") setHidden(e.newValue === "true")
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  // Reset dismissal whenever the user tries again, so a fresh failure surfaces
  // the pill again instead of silently leaving the user stuck.
  useEffect(() => {
    if (voice.status !== "denied") setVoiceDeniedDismissed(false)
  }, [voice.status])

  const chat = useExtensionChat(projectId, {
    onMutation: (result) => {
      void (async () => {
        const tab = await getActiveTab()
        void chrome.runtime.sendMessage({
          type: "RELAY_APPLY_AGENT_MEMORY_MUTATION",
          payload: { projectId, result, tabId: tab?.id ?? null },
        })
      })()
      try {
        const bc = new BroadcastChannel(MUTATION_CHANNEL)
        bc.postMessage({ type: "memory-mutated", result })
        bc.close()
      } catch {
        /* BroadcastChannel unavailable */
      }
      window.dispatchEvent(new CustomEvent("relay:memory-mutated", { detail: result }))
    },
    onChatChanged: () => setHistoryRefreshTick((tick) => tick + 1)
  })

  // Auto-scroll on new content and active-tool transitions.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    })
  }, [chat.messages, chat.streaming, chat.activeTool])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const maxHeight = 18 * 3 + 16
    el.style.height = "auto"
    const nextHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [draft])

  // Recompute height bounds when the side panel resizes.
  useEffect(() => {
    const onResize = () => setHeight((h) => Math.max(MIN_H, Math.min(h, modeMaxHeight(mode))))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [mode])

  // Snap to the default tall height when leaving full-screen.
  useEffect(() => {
    if (mode !== "tall") return
    setHeight(Math.max(MIN_H, Math.round(window.innerHeight * TALL_HEIGHT_RATIO)))
  }, [mode])

  // Mirror the control panel's selected project so Ask Relay defaults to it.
  useEffect(() => {
    const syncProject = () => {
      void resolveChatProjectId().then((id) => setProjectId(id))
    }
    syncProject()

    const handleRuntimeMessage = (message: unknown) => {
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "RELAY_ACTIVE_PROJECT_STATE_CHANGED" ||
        !("payload" in message)
      ) {
        return
      }
      const payload = (message as { payload?: { state?: RelayActiveProjectState } }).payload
      if (payload?.state?.projectId) {
        setProjectId(payload.state.projectId)
        return
      }
      syncProject()
    }

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(MUTATION_CHANNEL)
      channel.onmessage = syncProject
    } catch {
      /* BroadcastChannel unavailable */
    }

    const onMutated = () => syncProject()
    window.addEventListener("relay:memory-mutated", onMutated)
    chrome.runtime.onMessage.addListener(handleRuntimeMessage)

    return () => {
      channel?.close()
      window.removeEventListener("relay:memory-mutated", onMutated)
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
    }
  }, [])

  useEffect(() => {
    if (!historyOpen) return
    const t = setTimeout(() => {
      void chat.listChats(chatQuery.trim() || undefined).then(setChats)
    }, chatQuery ? 250 : 0)
    return () => clearTimeout(t)
  }, [historyOpen, chatQuery, chat, historyRefreshTick])

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
    if (!draft.trim() || chat.streaming || chat.hasUploadingAttachments) return
    chat.send(draft, { webSearch })
    setDraft("")
    setWebSearch(false)
    setComposerMenuOpen(false)
  }, [draft, chat, webSearch])

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

  const toggleFull = useCallback(() => {
    setMode((prev) => (prev === "full" ? "tall" : "full"))
  }, [])

  const modeClass = mode === "full" ? styles.modeFull : styles.modeTall
  const computedStyle = mode === "full" ? undefined : { height }
  const voiceStatusText =
    voice.status === "requesting"
      ? "Requesting microphone…"
      : voice.status === "listening"
        ? "Listening…"
        : voice.status === "denied"
          ? voice.error ?? "Microphone permission is blocked."
          : voice.status === "error"
            ? voice.error ?? "Voice input failed."
            : voice.status === "unsupported"
              ? "Voice input is not available here."
              : null

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

  if (hidden) return null

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
                      const ok = window.confirm(
                        `Delete chat "${c.title || "Untitled"}"? This can't be undone.`
                      )
                      if (!ok) return
                      void chat.deleteChat(c.id)
                      setChats((prev) => prev.filter((x) => x.id !== c.id))
                      if (c.id === chat.chatId) chat.reset()
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
      {previewAttachment ? (
        <div className={styles.previewOverlay} onClick={() => setPreviewAttachment(null)}>
          <div className={styles.previewFrame} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.previewClose}
              onClick={() => setPreviewAttachment(null)}
              aria-label="Close preview"
            >
              <X size={14} />
            </button>
            <AttachmentImage
              id={previewAttachment.id}
              fileName={previewAttachment.fileName}
              className={styles.previewImage}
              previewUrl={chat.attachments.find((a) => a.id === previewAttachment.id)?.previewUrl}
            />
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
            onClick={toggleFull}
            aria-label={mode === "full" ? "Exit full screen" : "Full screen"}
            title={mode === "full" ? "Exit full screen" : "Full screen"}
          >
            {mode === "full" ? <Minimize size={14} /> : <Maximize size={14} />}
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
            <div className={styles.suggestions}>
              {[
                "What can you do?",
                "What was I working on?",
                "Summarize my project",
                "Save a decision",
                "What are my open tasks?",
                "How do I use Relay?",
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.suggestionBtn}
                  onClick={() => {
                    chat.send(s, { webSearch })
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chat.messages.map((m) => (
            <MessageRow
              key={m.id}
              m={m}
              streaming={chat.streaming}
              onEdit={chat.editMessage}
              onConfirm={chat.confirmAction}
              onDecline={chat.declineAction}
              onConfirmAll={chat.confirmAllActions}
              onDeclineAll={chat.declineAllActions}
              onSelectBranch={chat.selectBranch}
              onCopy={(t) => navigator.clipboard?.writeText(t).catch(() => {})}
              onFeedback={chat.setFeedback}
              projectId={projectId}
              onSaveAttachment={chat.saveAttachmentToSources}
              onUndo={chat.undo}
            />
          ))
        )}
        {chat.streaming ? <ThinkingChip tool={chat.activeTool} /> : null}
        {chat.error ? (
          <div className={styles.error}>
            {typeof chat.error === "string" ? chat.error : chat.error.message}
            {typeof chat.error !== "string" && chat.error.upgradeUrl ? (
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={() => {
                  if (chat.error && typeof chat.error !== "string" && chat.error.upgradeUrl) {
                    void chrome.tabs.create({ url: chat.error.upgradeUrl })
                  }
                }}
              >
                Upgrade to keep going
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {(() => {
        const lastUsage = [...chat.messages].reverse().find((m) => m.usage)?.usage
        if (!lastUsage) return null
        const k = lastUsage.totalTokens >= 1000
          ? `${(lastUsage.totalTokens / 1000).toFixed(1)}k`
          : String(lastUsage.totalTokens)
        const max = lastUsage.maxContextTokens ?? 1_000_000
        const maxLabel = max >= 1_000_000 ? `${(max / 1_000_000).toFixed(max % 1_000_000 === 0 ? 0 : 1)}M` : `${Math.round(max / 1000)}k`
        return <div className={styles.usageBadge}>{k} / {maxLabel} tokens · {lastUsage.model ?? "Gemini Flash"}</div>
      })()}

      {voice.status === "denied" && !voiceDeniedDismissed ? (
        <div className={styles.deniedBar} role="alert">
          <span className={styles.deniedIcon}>
            <MicOff size={14} />
          </span>
          <span className={styles.deniedLabel}>Microphone access denied</span>
          <button
            type="button"
            className={styles.deniedAllow}
            onClick={() => openMicrophonePermissionTab()}
          >
            Allow
          </button>
          <button
            type="button"
            className={styles.deniedClose}
            aria-label="Dismiss microphone notice"
            onClick={() => setVoiceDeniedDismissed(true)}
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      {voice.listening || voice.status === "requesting" ? (
        <div className={styles.voiceBar} role="status">
          <VoiceRing
            active={voice.listening || voice.status === "requesting"}
            volumeRef={voice.volumeRef}
          />
          <button
            type="button"
            className={styles.voiceCancel}
            aria-label="Cancel voice input"
            onClick={() => voice.stop()}
          >
            <X size={14} />
          </button>
          <div className={styles.voiceCore}>
            <Waveform still={voice.status === "requesting"} levels={voice.levels} />
            <span
              className={`${styles.voiceTranscript} ${draft ? "" : styles.voiceTranscriptMuted}`}
            >
              {voice.status === "requesting"
                ? "Requesting microphone…"
                : draft || "Listening…"}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || chat.hasUploadingAttachments}
            className={styles.sendBtn}
            aria-label="Send"
            title="Send"
          >
            <ArrowUp size={14} />
          </button>
        </div>
      ) : (
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
        <div className={styles.menuWrap}>
          <button
            type="button"
            className={`${styles.attachBtn} ${composerMenuOpen ? styles.iconBtnActive : ""}`}
            aria-label="Add context"
            title="Add context"
            onClick={() => setComposerMenuOpen((open) => !open)}
          >
            <Plus size={14} />
          </button>
          {composerMenuOpen ? (
            <div className={styles.composerMenu}>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  fileInputRef.current?.click()
                  setComposerMenuOpen(false)
                }}
              >
                <Paperclip size={13} />
                <span>Upload files or images</span>
              </button>
              <button
                type="button"
                className={`${styles.menuItem} ${webSearch ? styles.menuItemActive : ""}`}
                onClick={() => setWebSearch((value) => !value)}
              >
                <Search size={13} />
                <span>Web search</span>
                <span className={`${styles.toggle} ${webSearch ? styles.toggleOn : ""}`} aria-hidden>
                  <span />
                </span>
              </button>
              <button
                type="button"
                className={`${styles.menuItem} ${chat.autoApprove ? styles.menuItemActive : ""}`}
                onClick={() => chat.setAutoApprove((v) => !v)}
              >
                <Zap size={13} />
                <span>Allow all actions</span>
                <span className={`${styles.toggle} ${chat.autoApprove ? styles.toggleOn : ""}`} aria-hidden>
                  <span />
                </span>
              </button>
            </div>
          ) : null}
        </div>
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
                      <button
                        type="button"
                        className={styles.thumbButton}
                        onClick={() => setPreviewAttachment({ id: a.id, fileName: a.fileName })}
                        aria-label={`Preview ${a.fileName}`}
                      >
                        <AttachmentImage id={a.id} fileName={a.fileName} className={styles.thumbImg} previewUrl={a.previewUrl} />
                      </button>
                    ) : (
                      <FileText size={11} />
                    )}
                    <span className={styles.chipLabel}>{a.fileName}</span>
                    {projectId && !a.uploading && !isImg ? (
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
          {webSearch ? (
            <button
              type="button"
              className={styles.searchPill}
              onClick={() => setWebSearch(false)}
              aria-label="Disable web search"
              title="Disable web search"
            >
              <Search size={11} />
              Search
              <X size={10} />
            </button>
          ) : null}
          <textarea
            ref={textareaRef}
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
          onClick={() => void voice.start()}
          disabled={!voice.supported}
          className={`${styles.attachBtn} ${
            voice.status === "denied" || voice.status === "error" ? styles.voiceError : ""
          }`}
          aria-label="Voice input"
          title={voiceStatusText ?? "Voice input"}
        >
          <Mic size={14} />
        </button>
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
            disabled={!draft.trim() || chat.hasUploadingAttachments}
            className={styles.sendBtn}
            aria-label="Send"
            title="Send"
          >
            <ArrowUp size={14} />
          </button>
        )}
      </div>
      )}
      {voice.status === "error" && voiceStatusText ? (
        <div className={`${styles.voiceStatus} ${styles.voiceStatusError}`}>
          {voiceStatusText}
        </div>
      ) : null}
    </div>
  )
}

function modeMaxHeight(mode: SizeMode): number {
  if (typeof window === "undefined") return 600
  if (mode === "full") return window.innerHeight
  return Math.round(window.innerHeight * TALL_HEIGHT_RATIO)
}
