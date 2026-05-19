import { useCallback, useMemo, useRef, useState } from "react"

import {
  derivePath,
  spliceOptimistic,
  type AssistantActionResult,
  type AssistantMessageDto,
  type AssistantPendingAction,
  type AssistantStreamEvent,
  type UiMessage
} from "@relay/shared"

import { getRelaySession } from "../storage/session"
import { getActiveTab } from "../utils/browser"

export interface ExtAttachment {
  id: string
  fileName: string
  mime: string
  byteSize: number
  hasText: boolean
  uploading?: boolean
  saving?: boolean
  savedToRelay?: boolean
}

export interface ExtChatSummary {
  id: string
  title: string
  updatedAt: string
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

export function useExtensionChat(opts?: {
  onMutation?: (r: AssistantActionResult) => void
}) {
  const onMutationRef = useRef(opts?.onMutation)
  onMutationRef.current = opts?.onMutation

  const [serverNodes, setServerNodes] = useState<AssistantMessageDto[]>([])
  const [optimistic, setOptimistic] = useState<UiMessage[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [branchParentId, setBranchParentId] = useState<string | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ExtAttachment[]>([])
  const chatIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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
      parentForOptimistic: string | null
    ) => {
      setError(null)
      setStreaming(true)
      setBranchParentId(parentForOptimistic)
      const controller = new AbortController()
      abortRef.current = controller
      let aborted = false
      const userTmp = tmp()
      const asstTmp = tmp()
      const seed: UiMessage[] = []
      if (optimisticUser) {
        seed.push({
          id: userTmp,
          parentId: parentForOptimistic,
          role: "user",
          content: optimisticUser,
          actionResults: [],
          feedback: null
        })
      }
      seed.push({
        id: asstTmp,
        parentId: optimisticUser ? userTmp : parentForOptimistic,
        role: "assistant",
        content: "",
        actionResults: [],
        feedback: null,
        streaming: true
      })
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
            chatId: chatIdRef.current,
            pageContext
          })
        })
        if (!res.ok || !res.body) {
          setError("Relay is unavailable right now.")
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
            } else if (ev.type === "text") {
              const delta = ev.delta
              patch((m) => ({ ...m, content: m.content + delta }))
            } else if (ev.type === "tool_start") {
              setActiveTool(ev.tool)
            } else if (ev.type === "tool_result") {
              const result = ev.result
              patch((m) => ({ ...m, actionResults: [...m.actionResults, result] }))
              setActiveTool(null)
              if (result.action !== "read") onMutationRef.current?.(result)
            } else if (ev.type === "pending_action") {
              const action = ev.action
              patch((m) => ({
                ...m,
                pending: action,
                content: m.content || `I can ${action.summary}. Confirm to proceed.`
              }))
            } else if (ev.type === "error") {
              setError(ev.message)
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
    [refresh]
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

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || streaming) return
      void runStream(
        { message: text.trim(), parentId: leafId, attachmentIds: readyAttachmentIds() },
        text.trim(),
        leafId
      )
      setAttachments([])
    },
    [runStream, streaming, leafId, readyAttachmentIds]
  )

  const editMessage = useCallback(
    (message: UiMessage, text: string) => {
      if (!text.trim() || streaming) return
      void runStream(
        { message: text.trim(), parentId: message.parentId, attachmentIds: readyAttachmentIds() },
        text.trim(),
        message.parentId
      )
      setAttachments([])
    },
    [runStream, streaming, readyAttachmentIds]
  )

  const confirmAction = useCallback(
    (action: AssistantPendingAction) => {
      if (streaming) return
      void runStream(
        { message: `Confirmed: ${action.summary}`, confirmActionId: action.id, parentId: leafId },
        null,
        leafId
      )
    },
    [runStream, streaming, leafId]
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
        body: JSON.stringify({ surface: "extension" })
      })
      if (!res.ok) return null
      const data = (await res.json()) as { chat: { id: string } }
      chatIdRef.current = data.chat.id
      setChatId(data.chat.id)
      return data.chat.id
    } catch {
      return null
    }
  }, [])

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const chat = await ensureChat()
      if (!chat) {
        setError("Couldn't start a chat for the attachment.")
        return
      }
      for (const file of files) {
        const localId = tmp()
        setAttachments((prev) => [
          ...prev,
          {
            id: localId,
            fileName: file.name,
            mime: file.type,
            byteSize: file.size,
            hasText: false,
            uploading: true
          }
        ])
        try {
          const fd = new FormData()
          fd.append("chatId", chat)
          fd.append("file", file)
          const res = await api("/api/assistant/attachments", { method: "POST", body: fd })
          if (!res.ok) throw new Error("upload failed")
          const data = (await res.json()) as ExtAttachment
          setAttachments((prev) =>
            prev.map((a) => (a.id === localId ? { ...data, uploading: false } : a))
          )
        } catch {
          setAttachments((prev) => prev.filter((a) => a.id !== localId))
          setError(`Couldn't attach ${file.name}.`)
        }
      }
    },
    [ensureChat]
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const saveAttachmentToSources = useCallback(async (id: string, projectId: string) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, saving: true } : a)))
    try {
      const res = await api(`/api/assistant/attachments/${id}/save-to-source`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId })
      })
      if (!res.ok) throw new Error("save failed")
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, saving: false, savedToRelay: true } : a))
      )
    } catch {
      setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, saving: false } : a)))
      setError("Couldn't save the attachment to Sources.")
    }
  }, [])

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
  }, [])

  const deleteChat = useCallback(async (id: string) => {
    await api(`/api/assistant/chats/${id}`, { method: "DELETE" }).catch(() => {})
  }, [])

  const loadChat = useCallback(
    async (id: string) => {
      abortRef.current?.abort()
      abortRef.current = null
      chatIdRef.current = id
      setChatId(id)
      setOptimistic([])
      setAttachments([])
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
    setAttachments([])
    setChatId(null)
    chatIdRef.current = null
    setError(null)
  }, [])

  return {
    messages: path,
    chatId,
    streaming,
    activeTool,
    error,
    attachments,
    send,
    stop,
    editMessage,
    confirmAction,
    selectBranch,
    addFiles,
    removeAttachment,
    saveAttachmentToSources,
    listProjects,
    listChats,
    renameChat,
    deleteChat,
    loadChat,
    reset
  }
}
