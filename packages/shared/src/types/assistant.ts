export type AssistantSurface = "dashboard" | "docs" | "settings" | "extension"

export type AssistantMessageRole = "user" | "assistant" | "tool" | "system"

export type AssistantMessageFeedback = "like" | "dislike"

export type AssistantActionKind = "created" | "updated" | "deleted" | "read"

export interface AssistantActionItem {
  id?: string
  label: string
}

/** Structured summary a tool returns so the UI can render a "what changed" card. */
export interface AssistantActionResult {
  tool: string
  action: AssistantActionKind
  entity: string
  count: number
  items: AssistantActionItem[]
  /** Present only for reversible creates so the UI can offer Undo. */
  undoRef?: {
    tool: string
    args: Record<string, unknown>
  }
  /** True when the effect cannot be reversed (e.g. a hard delete), so the
   *  UI states this instead of silently offering no Undo. */
  irreversible?: boolean
}

/** A destructive tool call awaiting explicit user confirmation. */
export interface AssistantPendingAction {
  id: string
  tool: string
  summary: string
  args: Record<string, unknown>
}

/** One web result the model used to ground its answer. */
export interface AssistantGroundingChunk {
  uri: string
  title?: string
}

export interface AssistantChatRow {
  id: string
  userId: string
  projectId: string | null
  title: string
  surface: AssistantSurface
  createdAt: string
  updatedAt: string
}

export interface AssistantMessageRow {
  id: string
  chatId: string
  userId: string
  parentId: string | null
  role: AssistantMessageRole
  content: string
  toolName: string | null
  toolPayload: Record<string, unknown>
  feedback: AssistantMessageFeedback | null
  tokenInput: number
  tokenOutput: number
  createdAt: string
}

export interface AssistantAttachmentRow {
  id: string
  chatId: string
  userId: string
  fileName: string
  mime: string
  byteSize: number
  storageKey: string
  extractedText: string | null
  savedToRelay: boolean
  createdAt: string
}

export interface AssistantChatSummaryDto {
  id: string
  title: string
  surface: AssistantSurface
  projectId: string | null
  updatedAt: string
}

export interface AssistantMessageDto {
  id: string
  parentId: string | null
  role: AssistantMessageRole
  content: string
  toolName: string | null
  /** @deprecated single result kept for back-compat; use actionResults */
  actionResult: AssistantActionResult | null
  /** All mutating tool results from the turn that produced this message. */
  actionResults: AssistantActionResult[]
  feedback: AssistantMessageFeedback | null
  createdAt: string
}

/** Server-Sent Events emitted by POST /api/assistant/chat. */
export type AssistantStreamEvent =
  | { type: "chat"; chatId: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; tool: string }
  | { type: "tool_result"; result: AssistantActionResult }
  | { type: "pending_action"; action: AssistantPendingAction }
  | { type: "usage"; totalTokens: number }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string; upgradeUrl?: string; plan?: string }
