"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import type {
  AssistantActionResult,
  AssistantMessageDto,
  AssistantMessageFeedback,
  AssistantPendingAction,
  AssistantStreamEvent,
  AssistantSurface
} from "@relay/shared"

export interface UiMessage {
  id: string
  parentId: string | null
  role: "user" | "assistant"
  content: string
  actionResults: AssistantActionResult[]
  feedback: AssistantMessageFeedback | null
  pending?: AssistantPendingAction
  streaming?: boolean
  /** 1-based position + total among sibling branches at this point. */
  branch?: { index: number; total: number; siblingIds: string[] }
}

export interface AssistantError {
  message: string
  upgradeUrl?: string
}

export interface PageContext {
  url?: string
  title?: string
  selection?: string
}

export interface UiAttachment {
  id: string
  fileName: string
  mime: string
  byteSize: number
  hasText: boolean
  uploading?: boolean
  saving?: boolean
  savedToRelay?: boolean
}

let localSeq = 0
const tmp = () => `tmp-${(localSeq += 1)}`
const keyOf = (parentId: string | null) => parentId ?? "root"

export function useAssistantChat(surface: AssistantSurface, projectId: string | null) {
  const [serverNodes, setServerNodes] = useState<AssistantMessageDto[]>([])
  const [optimistic, setOptimistic] = useState<UiMessage[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [chatId, setChatId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [error, setError] = useState<AssistantError | null>(null)
  // Parent the in-flight optimistic nodes hang from. Drives spliceOptimistic so
  // an edited prompt replaces its sibling in place instead of appending below
  // the stale branch until the post-stream refresh.
  const [branchParentId, setBranchParentId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<UiAttachment[]>([])
  const chatIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async (): Promise<AssistantMessageDto[]> => {
    const id = chatIdRef.current
    if (!id) return []
    try {
      const res = await fetch(`/api/assistant/chats/${id}`)
      if (!res.ok) return []
      const data = (await res.json()) as { messages: AssistantMessageDto[] }
      setServerNodes(data.messages)
      // Default to the newest leaf so a fresh branch is shown after sending.
      const newest = [...data.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)
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
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, surface, projectId, chatId: chatIdRef.current }),
          signal: controller.signal
        })

        if (!response.ok || !response.body) {
          let payload: { error?: string; upgradeUrl?: string } = {}
          try {
            payload = await response.json()
          } catch {
            /* noop */
          }
          setError({
            message: payload.error ?? "The assistant is unavailable right now.",
            upgradeUrl: payload.upgradeUrl
          })
          setOptimistic([])
          return
        }

        const reader = response.body.getReader()
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
            let event: AssistantStreamEvent
            try {
              event = JSON.parse(line.slice(5).trim())
            } catch {
              continue
            }
            switch (event.type) {
              case "chat":
                chatIdRef.current = event.chatId
                setChatId(event.chatId)
                break
              case "text":
                patch((m) => ({ ...m, content: m.content + event.delta }))
                break
              case "tool_start":
                setActiveTool(event.tool)
                break
              case "tool_result":
                patch((m) => ({ ...m, actionResults: [...m.actionResults, event.result] }))
                setActiveTool(null)
                break
              case "pending_action":
                patch((m) => ({
                  ...m,
                  pending: event.action,
                  content: m.content || `I can ${event.action.summary}. Confirm to proceed.`
                }))
                break
              case "error":
                setError({ message: event.message, upgradeUrl: event.upgradeUrl })
                break
              case "usage":
              case "done":
                break
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") {
          aborted = true
        } else {
          setError({ message: "Connection lost. Please try again." })
        }
      } finally {
        setActiveTool(null)
        setStreaming(false)
        abortRef.current = null
        if (aborted) {
          // Keep the partial answer on screen; the server turn may not have
          // persisted, so do not refresh it away.
          setOptimistic((prev) =>
            prev.map((m) =>
              m.id === asstTmp
                ? { ...m, streaming: false, content: m.content || "_(stopped)_" }
                : m
            )
          )
        } else {
          await refresh()
          setOptimistic([])
        }
      }
    },
    [surface, projectId, refresh]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // Derived active path through the branch tree. While a turn is in flight the
  // optimistic nodes are spliced at their branch parent so an edited prompt
  // replaces its sibling immediately instead of rendering below the old one.
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
    (text: string, pageContext?: PageContext) => {
      if (!text.trim() || streaming) return
      void runStream(
        { message: text.trim(), parentId: leafId, attachmentIds: readyAttachmentIds(), pageContext },
        text.trim(),
        leafId
      )
      setAttachments([])
    },
    [runStream, streaming, leafId, readyAttachmentIds]
  )

  const editMessage = useCallback(
    (message: UiMessage, text: string, pageContext?: PageContext) => {
      if (!text.trim() || streaming) return
      // Branch as a new sibling under the same parent as the edited message.
      void runStream(
        {
          message: text.trim(),
          parentId: message.parentId,
          attachmentIds: readyAttachmentIds(),
          pageContext
        },
        text.trim(),
        message.parentId
      )
      setAttachments([])
    },
    [runStream, streaming, readyAttachmentIds]
  )

  const ensureChat = useCallback(async (): Promise<string | null> => {
    if (chatIdRef.current) return chatIdRef.current
    try {
      const res = await fetch("/api/assistant/chats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface, projectId })
      })
      if (!res.ok) return null
      const data = (await res.json()) as { chat: { id: string } }
      chatIdRef.current = data.chat.id
      setChatId(data.chat.id)
      return data.chat.id
    } catch {
      return null
    }
  }, [surface, projectId])

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const chat = await ensureChat()
      if (!chat) {
        setError({ message: "Couldn't start a chat for the attachment." })
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
          const res = await fetch("/api/assistant/attachments", { method: "POST", body: fd })
          if (!res.ok) throw new Error("upload failed")
          const data = (await res.json()) as UiAttachment
          setAttachments((prev) =>
            prev.map((a) => (a.id === localId ? { ...data, uploading: false } : a))
          )
        } catch {
          setAttachments((prev) => prev.filter((a) => a.id !== localId))
          setError({ message: `Couldn't attach ${file.name}.` })
        }
      }
    },
    [ensureChat]
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const saveAttachmentToSources = useCallback(
    async (id: string) => {
      if (!projectId) return
      setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, saving: true } : a)))
      try {
        const res = await fetch(`/api/assistant/attachments/${id}/save-to-source`, {
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
        setError({ message: "Couldn't save the attachment to Sources." })
      }
    },
    [projectId]
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

  const setFeedback = useCallback(
    async (messageId: string, value: AssistantMessageFeedback) => {
      const next =
        serverNodes.find((m) => m.id === messageId)?.feedback === value ? null : value
      setServerNodes((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: next } : m))
      )
      await fetch(`/api/assistant/messages/${messageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedback: next })
      }).catch(() => {})
    },
    [serverNodes]
  )

  const undo = useCallback(async (result: AssistantActionResult) => {
    if (!result.undoRef) return
    await fetch("/api/assistant/undo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result.undoRef)
    }).catch(() => {})
    setServerNodes((prev) =>
      prev.map((m) => ({
        ...m,
        actionResult:
          m.actionResult === result
            ? { ...result, action: "deleted", entity: `${result.entity} (undone)` }
            : m.actionResult
      }))
    )
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
    setChatId(null)
    chatIdRef.current = null
    setBranchParentId(null)
    setAttachments([])
    setError(null)
  }, [])

  return {
    messages: path,
    chatId,
    streaming,
    activeTool,
    error,
    send,
    stop,
    editMessage,
    confirmAction,
    selectBranch,
    setFeedback,
    undo,
    attachments,
    addFiles,
    removeAttachment,
    saveAttachmentToSources,
    canSaveToSources: Boolean(projectId),
    loadChat,
    copyMessage: (text: string) => navigator.clipboard?.writeText(text).catch(() => {}),
    reset
  }
}

export function derivePath(
  nodes: AssistantMessageDto[],
  selections: Record<string, string>
): { nodes: UiMessage[]; leafId: string | null } {
  if (nodes.length === 0) return { nodes: [], leafId: null }
  const byParent = new Map<string, AssistantMessageDto[]>()
  for (const n of nodes) {
    const k = keyOf(n.parentId)
    const list = byParent.get(k) ?? []
    list.push(n)
    byParent.set(k, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  const out: UiMessage[] = []
  let parentKey = "root"
  let leafId: string | null = null
  let guard = 0
  while (guard < 400) {
    guard += 1
    const children = byParent.get(parentKey)
    if (!children || children.length === 0) break
    const chosenId = selections[parentKey]
    const chosen = children.find((c) => c.id === chosenId) ?? children[children.length - 1]
    if (!chosen) break
    const siblings = children.filter((c) => c.role === chosen.role)
    const payload = chosen as AssistantMessageDto & {
      actionResult?: AssistantActionResult | null
    }
    out.push({
      id: chosen.id,
      parentId: chosen.parentId,
      role: chosen.role === "user" ? "user" : "assistant",
      content: chosen.content,
      actionResults: payload.actionResult ? [payload.actionResult] : [],
      feedback: chosen.feedback,
      branch:
        siblings.length > 1
          ? {
              index: siblings.findIndex((s) => s.id === chosen.id) + 1,
              total: siblings.length,
              siblingIds: siblings.map((s) => s.id)
            }
          : undefined
    })
    leafId = chosen.id
    parentKey = chosen.id
  }
  return { nodes: out, leafId }
}

/**
 * Splice in-flight optimistic nodes onto the canonical path at their branch
 * parent. For a normal send the parent is the current leaf, so the whole base
 * path is kept and the new turn is appended (unchanged behaviour). For an
 * edited prompt the parent is an earlier node, so the stale sibling subtree
 * after it is dropped and the edited turn replaces it in place — no flicker,
 * no "sent as a new message then swapped seconds later".
 */
export function spliceOptimistic(
  base: UiMessage[],
  optimistic: UiMessage[],
  branchParentId: string | null
): UiMessage[] {
  if (optimistic.length === 0) return base
  if (branchParentId === null) return optimistic
  const idx = base.findIndex((n) => n.id === branchParentId)
  if (idx === -1) return [...base, ...optimistic]
  return [...base.slice(0, idx + 1), ...optimistic]
}
