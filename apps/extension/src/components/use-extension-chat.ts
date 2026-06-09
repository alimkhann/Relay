import { useCallback, useMemo, useRef, useState } from "react"

// Deep import keeps the shared barrel (node:crypto via utils/hashing) out of
// the extension bundle.
import {
  appendActionResult,
  derivePath,
  spliceOptimistic,
  type UiMessage
} from "@relay/shared/utils/assistant-chat-path"
import type {
  AssistantActionResult,
  AssistantAttachmentDto,
  AssistantMessageDto,
  AssistantPendingAction,
  AssistantStreamEvent
} from "@relay/shared"

import { getRelaySession } from "../storage/session"
import { getActiveTab } from "../utils/browser"

export interface ExtAttachment {
  id: string
  fileName: string
  mime: string
  byteSize: number
  hasText: boolean
  previewUrl?: string
  uploading?: boolean
  saving?: boolean
  savedToRelay?: boolean
}

const MAX_ATTACHMENTS_PER_MESSAGE = 8

function toAttachmentDto(a: ExtAttachment): AssistantAttachmentDto {
  return {
    id: a.id,
    fileName: a.fileName,
    mime: a.mime,
    byteSize: a.byteSize,
    hasText: a.hasText,
    savedToRelay: Boolean(a.savedToRelay),
    previewUrl: a.previewUrl
  }
}

export interface ExtChatSummary {
  id: string
  title: string
  updatedAt: string
}

export interface ExtSendOptions {
  webSearch?: boolean
}

interface PageContext {
  url?: string
  title?: string
}

let seq = 0
const tmp = () => `xtmp-${(seq += 1)}`
const keyOf = (parentId: string | null) => parentId ?? "root"

async function api(path: string, init?: RequestInit) {
  const session = await getRelaySession()
  return fetch(`${session.apiBase}${path}`, {
    ...init,
    headers: {
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      ...(init?.headers ?? {})
    }
  })
}

export function useExtensionChat(projectId: string | null, opts?: {
  onMutation?: (r: AssistantActionResult) => void
  onChatChanged?: () => void
}) {
  const onMutationRef = useRef(opts?.onMutation)
  onMutationRef.current = opts?.onMutation
  const onChatChangedRef = useRef(opts?.onChatChanged)
  onChatChangedRef.current = opts?.onChatChanged

  const [serverNodes, setServerNodes] = useState<AssistantMessageDto[]>([])
  const [optimistic, setOptimistic] = useState<UiMessage[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [branchParentId, setBranchParentId] = useState<string | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; upgradeUrl?: string } | string | null>(null)
  const [attachments, setAttachments] = useState<ExtAttachment[]>([])
  const attachmentsRef = useRef<ExtAttachment[]>([])
  const chatIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const autoApproveRef = useRef(false)

  const updateAttachments = useCallback((updater: (prev: ExtAttachment[]) => ExtAttachment[]) => {
    setAttachments((prev) => {
      const next = updater(prev)
      attachmentsRef.current = next
      return next
    })
  }, [])

  const revokePreviewUrls = useCallback((items: ExtAttachment[]) => {
    for (const item of items) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    }
  }, [])

  const refresh = useCallback(async (): Promise<AssistantMessageDto[]> => {
    const id = chatIdRef.current
    if (!id) return []
    try {
      const res = await api(`/api/assistant/chats/${id}`)
      if (!res.ok) return []
      const data = (await res.json()) as { messages: AssistantMessageDto[] }
      setServerNodes(data.messages)
      const newest = [...data.messages]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1)
      if (newest) {
        const path: Record<string, string> = {}
        const byId = new Map(data.messages.map((m) => [m.id, m]))
        let cursor: AssistantMessageDto | undefined = newest
        let guard = 0
        while (cursor && guard < 400) {
          path[keyOf(cursor.parentId)] = cursor.id
          cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
          guard += 1
        }
        setSelections((prev) => ({ ...prev, ...path }))
      }
      return data.messages
    } catch {
      return []
    }
  }, [])

  const runStream = useCallback(
    async (
      body: Record<string, unknown>,
      optimisticUser: string | null,
      parentForOptimistic: string | null,
      opts?: { replaceMessage?: UiMessage }
    ) => {
      setError(null)
      setStreaming(true)
      const replaceMessage = opts?.replaceMessage
      setBranchParentId(replaceMessage?.parentId ?? parentForOptimistic)
      const controller = new AbortController()
      abortRef.current = controller
      let aborted = false
      const userTmp = tmp()
      const asstTmp = replaceMessage?.id ?? tmp()
      const seed: UiMessage[] = []
      const optimisticAttachments =
        body.attachmentIds && Array.isArray(body.attachmentIds)
          ? attachments
              .filter((a) => !a.uploading && (body.attachmentIds as unknown[]).includes(a.id))
              .map(toAttachmentDto)
          : []
      if (replaceMessage) {
        seed.push({ ...replaceMessage, streaming: true })
      } else {
        if (optimisticUser) {
          seed.push({
            id: userTmp,
            parentId: parentForOptimistic,
            role: "user",
            content: optimisticUser,
            actionResults: [],
            pendingActions: [],
            toolSteps: [],
            attachments: optimisticAttachments,
            feedback: null
          })
        }
        seed.push({
          id: asstTmp,
          parentId: optimisticUser ? userTmp : parentForOptimistic,
          role: "assistant",
          content: "",
          actionResults: [],
          pendingActions: [],
          toolSteps: [],
          attachments: [],
          feedback: null,
          streaming: true
        })
      }
      setOptimistic(seed)
      const patch = (fn: (m: UiMessage) => UiMessage) =>
        setOptimistic((prev) => prev.map((m) => (m.id === asstTmp ? fn(m) : m)))

      try {
        const tab = await getActiveTab().catch(() => undefined)
        const pageContext: PageContext | undefined = tab
          ? { url: tab.url, title: tab.title }
          : undefined
        const res = await api("/api/assistant/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            ...body,
            surface: "extension",
            projectId,
            chatId: chatIdRef.current,
            pageContext,
            autoApproveDestructive: autoApproveRef.current || undefined
          })
        })
        if (!res.ok || !res.body) {
          let payload: { error?: string; upgradeUrl?: string; resetAt?: string } = {}
          try {
            payload = await res.json()
          } catch {
            /* noop */
          }
          const resetCopy = payload.resetAt
            ? ` Try again after ${new Date(payload.resetAt).toLocaleString()}.`
            : ""
          setError({
            message: `${payload.error ?? "Relay is unavailable right now."}${resetCopy}`,
            upgradeUrl: payload.upgradeUrl
          })
          setOptimistic([])
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
              setChatId(ev.chatId)
              onChatChangedRef.current?.()
            } else if (ev.type === "text") {
              const delta = ev.delta
              patch((m) => ({ ...m, content: m.content + delta }))
            } else if (ev.type === "tool_start") {
              setActiveTool(ev.tool)
              patch((m) => ({
                ...m,
                toolSteps: [
                  ...(m.toolSteps ?? []).map((s) =>
                    s.status === "active" ? { ...s, status: "complete" as const } : s
                  ),
                  { label: ev.tool, status: "active" as const }
                ]
              }))
            } else if (ev.type === "tool_result") {
              const result = ev.result
              patch((m) => ({
                ...m,
                actionResults: appendActionResult(m.actionResults, result),
                pending: undefined,
                toolSteps: (m.toolSteps ?? []).map((s, i, arr) =>
                  i === arr.length - 1 && s.status === "active"
                    ? { ...s, status: "complete" as const }
                    : s
                )
              }))
              setActiveTool(null)
              if (result.action !== "read") onMutationRef.current?.(result)
            } else if (ev.type === "pending_action") {
              const action = ev.action
              patch((m) => ({
                ...m,
                pendingActions: [...(m.pendingActions ?? []), action],
                content: m.content || `I can ${action.summary}. Confirm to proceed.`
              }))
            } else if (ev.type === "action_update") {
              const action = ev.action
              patch((m) => {
                const existingIdx = (m.pendingActions ?? []).findIndex((pa) => pa.id === action.id)
                if (existingIdx === -1) {
                  // Legacy fallback
                  if ((action.status === "succeeded" || action.status === "failed") && action.result) {
                    return {
                      ...m,
                      actionResults: appendActionResult(m.actionResults, action.result),
                      pending: undefined,
                      content: "",
                      streaming: false
                    }
                  }
                  return { ...m, pending: action, content: action.status === "pending" ? m.content : "" }
                }
                const pendingActions = (m.pendingActions ?? []).map((pa) =>
                  pa.id === action.id ? { ...pa, ...action } : pa
                )
                if ((action.status === "succeeded" || action.status === "failed") && action.result) {
                  return {
                    ...m,
                    pendingActions,
                    actionResults: appendActionResult(m.actionResults, action.result)
                  }
                }
                return { ...m, pendingActions }
              })
              if (action.status === "succeeded" && action.result && action.result.action !== "read") {
                onMutationRef.current?.(action.result)
              }
            } else if (ev.type === "error") {
              setError(ev.message)
              patch((m) => {
                const pendingActions = (m.pendingActions ?? []).map((pa) =>
                  pa.status === "running" ? { ...pa, status: "pending" as const } : pa
                )
                if (m.pending?.status === "running") {
                  return {
                    ...m,
                    pending: { ...m.pending, status: "pending" },
                    pendingActions,
                    streaming: false
                  }
                }
                return { ...m, pendingActions, streaming: false }
              })
            } else if (ev.type === "usage") {
              patch((m) => ({
                ...m,
                usage: {
                  totalTokens: ev.totalTokens,
                  maxContextTokens: ev.maxContextTokens,
                  model: ev.model
                }
              }))
            } else if (ev.type === "done") {
              onChatChangedRef.current?.()
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") {
          aborted = true
        } else {
          setError("Connection lost. Please try again.")
        }
      } finally {
        setActiveTool(null)
        setStreaming(false)
        abortRef.current = null
        if (aborted) {
          setOptimistic((prev) =>
            prev.map((m) =>
              m.streaming ? { ...m, streaming: false, content: m.content || "_(stopped)_" } : m
            )
          )
        } else {
          await refresh()
          setOptimistic([])
        }
      }
    },
    [refresh, attachments, projectId]
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const { path, leafId } = useMemo(() => {
    const d = derivePath(serverNodes, selections)
    if (optimistic.length > 0) {
      return { path: spliceOptimistic(d.nodes, optimistic, branchParentId), leafId: d.leafId }
    }
    return { path: d.nodes, leafId: d.leafId }
  }, [serverNodes, selections, optimistic, branchParentId])

  const readyAttachmentIds = useCallback(
    () => attachments.filter((a) => !a.uploading).map((a) => a.id),
    [attachments]
  )
  const hasUploadingAttachments = attachments.some((a) => a.uploading)

  const send = useCallback(
    (text: string, options?: ExtSendOptions) => {
      if (!text.trim() || streaming || hasUploadingAttachments) return
      void runStream(
        {
          message: text.trim(),
          parentId: leafId,
          attachmentIds: readyAttachmentIds(),
          webSearch: options?.webSearch || undefined
        },
        text.trim(),
        leafId
      )
      revokePreviewUrls(attachmentsRef.current)
      updateAttachments(() => [])
    },
    [runStream, streaming, hasUploadingAttachments, leafId, readyAttachmentIds]
  )

  const editMessage = useCallback(
    (message: UiMessage, text: string, options?: ExtSendOptions) => {
      if (!text.trim() || streaming || hasUploadingAttachments) return
      void runStream(
        {
          message: text.trim(),
          parentId: message.parentId,
          attachmentIds: readyAttachmentIds(),
          webSearch: options?.webSearch || undefined
        },
        text.trim(),
        message.parentId
      )
      revokePreviewUrls(attachmentsRef.current)
      updateAttachments(() => [])
    },
    [runStream, streaming, hasUploadingAttachments, readyAttachmentIds]
  )

  const [autoApprove, setAutoApproveState] = useState(false)
  const setAutoApprove = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setAutoApproveState((prev) => {
      const next = typeof v === "function" ? v(prev) : v
      autoApproveRef.current = next
      return next
    })
  }, [])

  const confirmAction = useCallback(
    (action: AssistantPendingAction) => {
      if (streaming) return
      const pendingMsg = path.find(
        (m) => m.pending?.id === action.id || m.pendingActions.some((pa) => pa.id === action.id)
      )
      if (!pendingMsg) return
      void runStream(
        {
          message: `Allow: ${action.summary}`,
          actionDecision: { actionId: action.id, decision: "allow" },
          parentId: leafId
        },
        null,
        pendingMsg.parentId,
        {
          replaceMessage: {
            ...pendingMsg,
            pending: { ...action, status: "running" },
            pendingActions: pendingMsg.pendingActions.map((pa) =>
              pa.id === action.id ? { ...pa, status: "running" as const } : pa
            ),
            streaming: true
          }
        }
      )
    },
    [runStream, streaming, leafId, path]
  )

  const declineAction = useCallback(
    (action: AssistantPendingAction) => {
      if (streaming) return
      const pendingMsg = path.find(
        (m) => m.pending?.id === action.id || m.pendingActions.some((pa) => pa.id === action.id)
      )
      if (!pendingMsg) return
      void runStream(
        {
          message: `Decline: ${action.summary}`,
          actionDecision: { actionId: action.id, decision: "decline" },
          parentId: leafId
        },
        null,
        pendingMsg.parentId,
        {
          replaceMessage: {
            ...pendingMsg,
            pendingActions: pendingMsg.pendingActions.filter((pa) => pa.id !== action.id),
            streaming: true
          }
        }
      )
    },
    [runStream, streaming, leafId, path]
  )

  const confirmAllActions = useCallback(
    (msg: UiMessage) => {
      const pending = msg.pendingActions.filter((pa) => pa.status === "pending")
      if (streaming || pending.length === 0) return
      void runStream(
        {
          message: `Allow ${pending.length} actions`,
          actionDecision: { actionId: pending[0]!.id, actionIds: pending.map((action) => action.id), decision: "allow" },
          parentId: leafId
        },
        null,
        msg.parentId,
        {
          replaceMessage: {
            ...msg,
            pendingActions: msg.pendingActions.map((action) =>
              action.status === "pending" ? { ...action, status: "running" as const } : action
            ),
            streaming: true
          }
        }
      )
    },
    [leafId, runStream, streaming]
  )

  const declineAllActions = useCallback(
    (msg: UiMessage) => {
      const pending = msg.pendingActions.filter((pa) => pa.status === "pending")
      if (streaming || pending.length === 0) return
      void runStream(
        {
          message: `Decline ${pending.length} actions`,
          actionDecision: { actionId: pending[0]!.id, actionIds: pending.map((action) => action.id), decision: "decline" },
          parentId: leafId
        },
        null,
        msg.parentId,
        { replaceMessage: { ...msg, pendingActions: [], streaming: true } }
      )
    },
    [leafId, runStream, streaming]
  )

  const selectBranch = useCallback((parentId: string | null, siblingId: string) => {
    setSelections((prev) => ({ ...prev, [keyOf(parentId)]: siblingId }))
  }, [])

  const ensureChat = useCallback(async (): Promise<string | null> => {
    if (chatIdRef.current) return chatIdRef.current
    try {
      const res = await api("/api/assistant/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface: "extension", projectId })
      })
      if (!res.ok) return null
      const data = (await res.json()) as { chat: { id: string } }
      chatIdRef.current = data.chat.id
      setChatId(data.chat.id)
      return data.chat.id
    } catch {
      return null
    }
  }, [projectId])

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const slotsLeft = MAX_ATTACHMENTS_PER_MESSAGE - attachmentsRef.current.length
      if (slotsLeft <= 0) {
        setError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`)
        return
      }
      const acceptedFiles = files.slice(0, slotsLeft)
      if (acceptedFiles.length < files.length) {
        setError(`Only ${MAX_ATTACHMENTS_PER_MESSAGE} attachments can be sent in one message.`)
      }
      const chat = await ensureChat()
      if (!chat) {
        setError("Couldn't start a chat for the attachment.")
        return
      }
      for (const file of acceptedFiles) {
        const localId = tmp()
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
        updateAttachments((prev) => [
          ...prev,
          {
            id: localId,
            fileName: file.name,
            mime: file.type,
            byteSize: file.size,
            hasText: false,
            previewUrl,
            uploading: true
          }
        ])
        try {
          const fd = new FormData()
          fd.append("chatId", chat)
          fd.append("file", file)
          const res = await api("/api/assistant/attachments", { method: "POST", body: fd })
          if (!res.ok) {
            // Surface the server's reason so unsupported types / chat-full
            // hit the user instead of failing silently.
            const body = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(body?.error || `upload failed (${res.status})`)
          }
          const data = (await res.json()) as ExtAttachment
          updateAttachments((prev) =>
            prev.map((a) =>
              a.id === localId ? { ...data, previewUrl: a.previewUrl, uploading: false } : a
            )
          )
        } catch (err) {
          updateAttachments((prev) => {
            const removed = prev.filter((a) => a.id === localId)
            revokePreviewUrls(removed)
            return prev.filter((a) => a.id !== localId)
          })
          const reason = err instanceof Error ? err.message : "unknown error"
          setError(`Couldn't attach ${file.name}: ${reason}`)
        }
      }
    },
    [ensureChat, revokePreviewUrls, updateAttachments]
  )

  const removeAttachment = useCallback((id: string) => {
    updateAttachments((prev) => {
      const removed = prev.filter((a) => a.id === id)
      revokePreviewUrls(removed)
      return prev.filter((a) => a.id !== id)
    })
  }, [revokePreviewUrls, updateAttachments])

  const setFeedback = useCallback(
    async (messageId: string, value: "like" | "dislike" | null) => {
      // Optimistic — the server persists asynchronously and we don't want the
      // thumb to flicker while the PATCH is in flight.
      setServerNodes((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: value } : m))
      )
      await api(`/api/assistant/messages/${messageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedback: value })
      }).catch(() => {})
    },
    []
  )

  const saveAttachmentToSources = useCallback(async (id: string, projectId: string) => {
    updateAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, saving: true } : a)))
    try {
      const res = await api(`/api/assistant/attachments/${id}/save-to-source`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId })
      })
      if (!res.ok) throw new Error("save failed")
      updateAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, saving: false, savedToRelay: true } : a))
      )
      setServerNodes((prev) =>
        prev.map((m) => ({
          ...m,
          attachments: m.attachments.map((a) => (a.id === id ? { ...a, savedToRelay: true } : a))
        }))
      )
    } catch {
      updateAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, saving: false } : a)))
      setError("Couldn't save the attachment to Sources.")
    }
  }, [updateAttachments])

  const listProjects = useCallback(async (): Promise<{ id: string; name: string }[]> => {
    try {
      const res = await api("/api/projects")
      if (!res.ok) return []
      const data = (await res.json()) as { projects: { id: string; name: string }[] }
      return data.projects
    } catch {
      return []
    }
  }, [])

  const listChats = useCallback(async (query?: string): Promise<ExtChatSummary[]> => {
    try {
      const res = await api(
        `/api/assistant/chats${query ? `?q=${encodeURIComponent(query)}` : ""}`
      )
      if (!res.ok) return []
      const data = (await res.json()) as { chats: ExtChatSummary[] }
      return data.chats
    } catch {
      return []
    }
  }, [])

  const renameChat = useCallback(async (id: string, title: string) => {
    await api(`/api/assistant/chats/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title })
    }).catch(() => {})
    onChatChangedRef.current?.()
  }, [])

  const deleteChat = useCallback(async (id: string) => {
    await api(`/api/assistant/chats/${id}`, { method: "DELETE" }).catch(() => {})
    onChatChangedRef.current?.()
  }, [])

  const loadChat = useCallback(
    async (id: string) => {
      abortRef.current?.abort()
      abortRef.current = null
      chatIdRef.current = id
      setChatId(id)
      setOptimistic([])
      revokePreviewUrls(attachmentsRef.current)
      updateAttachments(() => [])
      setSelections({})
      setBranchParentId(null)
      setError(null)
      await refresh()
    },
    [refresh]
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setServerNodes([])
    setOptimistic([])
    setSelections({})
    setBranchParentId(null)
    revokePreviewUrls(attachmentsRef.current)
    updateAttachments(() => [])
    setChatId(null)
    chatIdRef.current = null
    setError(null)
  }, [revokePreviewUrls, updateAttachments])

  // Reverse a reversible agent mutation (parity with the web assistant). The
  // action card flips to its "undone" label locally on success.
  const undo = useCallback(async (result: AssistantActionResult): Promise<boolean> => {
    if (!result.undoRef) return false
    try {
      const res = await api("/api/assistant/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result.undoRef),
      })
      if (res.ok && result.action === "created") {
        onMutationRef.current?.({
          tool: result.tool,
          action: "deleted",
          entity: result.entity,
          count: result.count,
          items: result.items,
          previews: result.previews?.map((preview) => ({
            before: preview.after ?? preview.before,
          })),
        })
      }
      return res.ok
    } catch {
      return false
    }
  }, [])

  return {
    messages: path,
    undo,
    chatId,
    streaming,
    activeTool,
    error,
    attachments,
    hasUploadingAttachments,
    send,
    stop,
    editMessage,
    confirmAction,
    declineAction,
    confirmAllActions,
    declineAllActions,
    autoApprove,
    setAutoApprove,
    selectBranch,
    addFiles,
    removeAttachment,
    saveAttachmentToSources,
    setFeedback,
    listProjects,
    listChats,
    renameChat,
    deleteChat,
    loadChat,
    reset
  }
}
