"use client"

import { useCallback, useMemo, useRef, useState } from "react"

// Deep import: pulling these values from the @relay/shared barrel would drag
// node:crypto (via utils/hashing) into the client bundle and fail the build.
import {
  chatKeyOf as keyOf,
  derivePath,
  spliceOptimistic,
  type UiMessage
} from "@relay/shared/utils/assistant-chat-path"
import {
  commandToMemoryPatch,
  parseAssistantCommand,
  type ParsedAssistantCommand,
} from "@relay/shared/utils/assistant-command-parser"
import type {
  AssistantActionResult,
  AssistantAttachmentDto,
  AssistantMessageDto,
  AssistantMessageFeedback,
  AssistantPendingAction,
  AssistantStreamEvent,
  AssistantSurface
} from "@relay/shared"

export { derivePath, spliceOptimistic }
export type { UiMessage }

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
  previewUrl?: string
  uploading?: boolean
  saving?: boolean
  savedToRelay?: boolean
}

const MAX_ATTACHMENTS_PER_MESSAGE = 8

function toAttachmentDto(a: UiAttachment): AssistantAttachmentDto {
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

export interface AssistantSendOptions {
  webSearch?: boolean
}

let localSeq = 0
const tmp = () => `tmp-${(localSeq += 1)}`

export function useAssistantChat(
  surface: AssistantSurface,
  projectId: string | null,
  opts?: {
    onMutation?: (result: AssistantActionResult) => void
    onChatChanged?: () => void
  }
) {
  const onMutationRef = useRef(opts?.onMutation)
  onMutationRef.current = opts?.onMutation
  const onChatChangedRef = useRef(opts?.onChatChanged)
  onChatChangedRef.current = opts?.onChatChanged
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
  const attachmentsRef = useRef<UiAttachment[]>([])
  const chatIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const updateAttachments = useCallback(
    (updater: (prev: UiAttachment[]) => UiAttachment[]) => {
      setAttachments((prev) => {
        const next = updater(prev)
        attachmentsRef.current = next
        return next
      })
    },
    []
  )

  const revokePreviewUrls = useCallback((items: UiAttachment[]) => {
    for (const item of items) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    }
  }, [])

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
      const optimisticAttachments =
        body.attachmentIds && Array.isArray(body.attachmentIds)
          ? attachments
              .filter((a) => !a.uploading && (body.attachmentIds as unknown[]).includes(a.id))
              .map(toAttachmentDto)
          : []
      if (optimisticUser) {
        seed.push({
          id: userTmp,
          parentId: parentForOptimistic,
          role: "user",
          content: optimisticUser,
          actionResults: [],
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
        attachments: [],
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
                onChatChangedRef.current?.()
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
                // Reflect a write the agent just made (memory/state) in the
                // surrounding surface (e.g. router.refresh() the memory list).
                if (event.result.action !== "read") {
                  onMutationRef.current?.(event.result)
                }
                break
              case "pending_action":
                patch((m) => ({
                  ...m,
                  pending: event.action,
                  content: m.content || `I can ${event.action.summary}. Confirm to proceed.`
                }))
                break
              case "pending_continuation":
                patch((m) => ({ ...m, pendingContinuation: { reason: event.reason } }))
                break
              case "error":
                setError({ message: event.message, upgradeUrl: event.upgradeUrl })
                break
              case "usage":
              case "done":
                onChatChangedRef.current?.()
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
    [surface, projectId, refresh, attachments]
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
  const hasUploadingAttachments = attachments.some((a) => a.uploading)

  // F2 — hygiene command interceptor. /reaffirm /forget /obsolete /archive
  // /restore short-circuit the LLM round-trip and PATCH the memory item
  // directly. The exchange lives in optimistic state only — it's intentionally
  // not persisted to the chat backend so hygiene chatter doesn't pollute the
  // LLM context window.
  const runHygieneCommand = useCallback(
    async (cmd: ParsedAssistantCommand, rawText: string) => {
      setError(null)
      const userTmp = tmp()
      const asstTmp = tmp()
      const parentForOptimistic = leafId
      setBranchParentId(parentForOptimistic)

      const seed: UiMessage[] = [
        {
          id: userTmp,
          parentId: parentForOptimistic,
          role: "user",
          content: rawText,
          actionResults: [],
          attachments: [],
          feedback: null,
        },
        {
          id: asstTmp,
          parentId: userTmp,
          role: "assistant",
          content: `Running \`/${cmd.command}\` on \`${cmd.memoryId}\`…`,
          actionResults: [],
          attachments: [],
          feedback: null,
          streaming: true,
        },
      ]
      setOptimistic(seed)

      const lifecycle = (
        {
          reaffirm: "active",
          obsolete: "cooling",
          archive: "archived",
          forget: "forgotten",
          restore: "active",
        } as const
      )[cmd.command]
      const verbPast = (
        {
          reaffirm: "Reaffirmed",
          obsolete: "Marked obsolete",
          archive: "Archived",
          forget: "Forgot",
          restore: "Restored",
        } as const
      )[cmd.command]
      const irreversible = cmd.command === "forget"

      try {
        const res = await fetch(`/api/memory/${cmd.memoryId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandToMemoryPatch(cmd)),
        })
        if (!res.ok) {
          let errMsg = `Failed to ${cmd.command} memory ${cmd.memoryId}.`
          try {
            const j = (await res.json()) as { error?: string }
            if (j?.error) errMsg = j.error
          } catch {
            /* noop */
          }
          setOptimistic((prev) =>
            prev.map((m) =>
              m.id === asstTmp ? { ...m, streaming: false, content: errMsg } : m,
            ),
          )
          return
        }
        const actionResult: AssistantActionResult = {
          tool: "manage_memory",
          action: cmd.command === "forget" ? "deleted" : "updated",
          entity: "memory item",
          count: 1,
          items: [{ id: cmd.memoryId, label: cmd.memoryId, lifecycle }],
          irreversible: irreversible || undefined,
        }
        setOptimistic((prev) =>
          prev.map((m) =>
            m.id === asstTmp
              ? {
                  ...m,
                  streaming: false,
                  content: `${verbPast} memory item.`,
                  actionResults: [actionResult],
                }
              : m,
          ),
        )
        onMutationRef.current?.(actionResult)
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Failed to ${cmd.command}.`
        setOptimistic((prev) =>
          prev.map((m) => (m.id === asstTmp ? { ...m, streaming: false, content: msg } : m)),
        )
      }
    },
    [leafId],
  )

  const send = useCallback(
    (text: string, pageContext?: PageContext, options?: AssistantSendOptions) => {
      if (!text.trim() || streaming || hasUploadingAttachments) return
      const trimmed = text.trim()
      const cmd = parseAssistantCommand(trimmed)
      if (cmd) {
        void runHygieneCommand(cmd, trimmed)
        revokePreviewUrls(attachmentsRef.current)
        updateAttachments(() => [])
        return
      }
      void runStream(
        {
          message: trimmed,
          parentId: leafId,
          attachmentIds: readyAttachmentIds(),
          pageContext,
          webSearch: options?.webSearch || undefined
        },
        trimmed,
        leafId
      )
      revokePreviewUrls(attachmentsRef.current)
      updateAttachments(() => [])
    },
    [runStream, streaming, hasUploadingAttachments, leafId, readyAttachmentIds, runHygieneCommand]
  )

  // W1 — Continue button handler. When the agent hits its step budget the
  // assistant message carries pendingContinuation; clicking Continue branches
  // a new "continue" turn off that message so the agent picks up where it
  // stopped instead of re-running the whole conversation.
  const continueTurn = useCallback(
    (assistantMessage: UiMessage) => {
      if (streaming || hasUploadingAttachments) return
      void runStream(
        {
          message: "continue",
          parentId: assistantMessage.id,
          attachmentIds: [],
        },
        "continue",
        assistantMessage.id,
      )
    },
    [runStream, streaming, hasUploadingAttachments],
  )

  const editMessage = useCallback(
    (message: UiMessage, text: string, pageContext?: PageContext, options?: AssistantSendOptions) => {
      if (!text.trim() || streaming || hasUploadingAttachments) return
      // Branch as a new sibling under the same parent as the edited message.
      void runStream(
        {
          message: text.trim(),
          parentId: message.parentId,
          attachmentIds: readyAttachmentIds(),
          pageContext,
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
      const slotsLeft = MAX_ATTACHMENTS_PER_MESSAGE - attachmentsRef.current.length
      if (slotsLeft <= 0) {
        setError({ message: `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.` })
        return
      }
      const acceptedFiles = files.slice(0, slotsLeft)
      if (acceptedFiles.length < files.length) {
        setError({ message: `Only ${MAX_ATTACHMENTS_PER_MESSAGE} attachments can be sent in one message.` })
      }
      const chat = await ensureChat()
      if (!chat) {
        setError({ message: "Couldn't start a chat for the attachment." })
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
          const res = await fetch("/api/assistant/attachments", { method: "POST", body: fd })
          if (!res.ok) throw new Error("upload failed")
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(body?.error || `upload failed (${res.status})`)
          }
          const data = (await res.json()) as UiAttachment
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
          const reason = err instanceof Error ? err.message : "upload failed"
          setError({ message: `Couldn't attach ${file.name}: ${reason}` })
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

  const saveAttachmentToSources = useCallback(
    async (id: string) => {
      if (!projectId) return
      updateAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, saving: true } : a)))
      try {
        const res = await fetch(`/api/assistant/attachments/${id}/save-to-source`, {
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
            attachments: m.attachments.map((a) =>
              a.id === id ? { ...a, savedToRelay: true } : a
            )
          }))
        )
      } catch {
        updateAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, saving: false } : a)))
        setError({ message: "Couldn't save the attachment to Sources." })
      }
    },
    [projectId, updateAttachments]
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
    setChatId(null)
    chatIdRef.current = null
    setBranchParentId(null)
    revokePreviewUrls(attachmentsRef.current)
    updateAttachments(() => [])
    setError(null)
  }, [revokePreviewUrls, updateAttachments])

  return {
    messages: path,
    chatId,
    streaming,
    activeTool,
    error,
    send,
    stop,
    editMessage,
    continueTurn,
    confirmAction,
    selectBranch,
    setFeedback,
    undo,
    attachments,
    hasUploadingAttachments,
    addFiles,
    removeAttachment,
    saveAttachmentToSources,
    canSaveToSources: Boolean(projectId),
    loadChat,
    copyMessage: (text: string) => navigator.clipboard?.writeText(text).catch(() => {}),
    reset
  }
}
