export type AssistantSurface = "dashboard" | "docs" | "settings" | "extension"

export type AssistantMessageRole = "user" | "assistant" | "tool" | "system"

export type AssistantMessageFeedback = "like" | "dislike"

export type AssistantActionKind = "created" | "updated" | "deleted" | "read"
export type AssistantActionStatus =
  | "pending"
  | "running"
  | "approved"
  | "declined"
  | "succeeded"
  | "failed"

export interface AssistantActionItem {
  id?: string
  label: string
  title?: string | null
  content?: string
  type?: string
  projectId?: string | null
  personalCategory?: string | null
  /** When the action transitions a memory item's lifecycle, the card renders
   * a pill so the user can see at a glance what state the item is now in.
   * Set by hygiene-command tool results (F2) and recall hits that surface
   * non-`active` items. */
  lifecycle?: "active" | "cooling" | "archived" | "forgotten"
}

export interface AssistantActionPreview {
  before?: AssistantActionItem
  after?: AssistantActionItem
}

/** Structured summary a tool returns so the UI can render a "what changed" card. */
export interface AssistantActionResult {
  tool: string
  action: AssistantActionKind
  entity: string
  count: number
  items: AssistantActionItem[]
  previews?: AssistantActionPreview[]
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
  status?: AssistantActionStatus
  result?: AssistantActionResult
  error?: string
  previews?: AssistantActionPreview[]
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

export interface AssistantAttachmentDto {
  id: string
  fileName: string
  mime: string
  byteSize: number
  hasText: boolean
  savedToRelay: boolean
  /** Client-only preview URL used before an uploaded image can be refetched. */
  previewUrl?: string
  createdAt?: string
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
  attachments: AssistantAttachmentDto[]
  feedback: AssistantMessageFeedback | null
  createdAt: string
  /** Populated for unconsumed pending_action messages so the UI can re-render confirm/decline buttons after reload. */
  pending?: AssistantPendingAction | null
}

/** Server-Sent Events emitted by POST /api/assistant/chat. */
export type AssistantStreamEvent =
  | { type: "chat"; chatId: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; tool: string }
  | { type: "tool_result"; result: AssistantActionResult }
  | { type: "pending_action"; action: AssistantPendingAction }
  | { type: "action_update"; action: AssistantPendingAction }
  /** Step budget exhausted. UI shows a "Continue" button so the user can
   * resume without re-typing — sends a follow-up turn that branches off the
   * cap-hit assistant message. Server still emits the trailing text + done. */
  | { type: "pending_continuation"; reason: "step_limit"; assistantMessageId?: string }
  | { type: "usage"; totalTokens: number }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string; upgradeUrl?: string; plan?: string }
