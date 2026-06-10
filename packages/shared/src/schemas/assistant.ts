import { z } from "zod"

export const assistantSurfaceSchema = z.enum(["dashboard", "docs", "settings", "extension"])

export const createAssistantChatSchema = z.object({
  surface: assistantSurfaceSchema.default("dashboard"),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200).optional()
})

export const renameAssistantChatSchema = z.object({
  title: z.string().min(1).max(200)
})

export const sendAssistantMessageSchema = z.object({
  chatId: z.string().uuid().nullable().optional(),
  surface: assistantSurfaceSchema.default("dashboard"),
  projectId: z.string().uuid().nullable().optional(),
  /** The message this turn branches from. Null/absent starts a fresh path. */
  parentId: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(8000),
  /** Set when the user approves a previously emitted pending_action. */
  confirmActionId: z.string().min(1).optional(),
  /** Set when the user declines a previously emitted pending_action (marks it consumed without executing). */
  declineActionId: z.string().min(1).optional(),
  /** Resolve an action card in place without creating a synthetic chat message. */
  actionDecision: z
    .object({
      actionId: z.string().min(1),
      /** Bulk decisions keep actionId as a compatibility alias for older servers. */
      actionIds: z.array(z.string().min(1)).min(1).max(20).optional(),
      decision: z.enum(["allow", "decline"])
    })
    .optional(),
  /** When true, the agent executes destructive actions without pausing for confirmation. */
  autoApproveDestructive: z.boolean().optional(),
  /** Attachments (already uploaded to this chat) to feed into the turn. */
  attachmentIds: z.array(z.string().uuid()).max(8).optional(),
  /** Force a paid web-grounded answer for this turn. */
  webSearch: z.boolean().optional(),
  /** Page/extension context the agent can use without a tool call. */
  pageContext: z
    .object({
      url: z.string().optional(),
      title: z.string().optional(),
      selection: z.string().max(20000).optional()
    })
    .optional()
})

export const assistantFeedbackSchema = z.object({
  feedback: z.enum(["like", "dislike"]).nullable()
})

export type AssistantFeedbackInput = z.infer<typeof assistantFeedbackSchema>
export type CreateAssistantChatInput = z.infer<typeof createAssistantChatSchema>
export type RenameAssistantChatInput = z.infer<typeof renameAssistantChatSchema>
export type SendAssistantMessageInput = z.infer<typeof sendAssistantMessageSchema>
