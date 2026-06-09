import type {
  AssistantActionResult,
  AssistantAttachmentDto,
  AssistantMessageDto,
  AssistantMessageFeedback,
  AssistantPendingAction
} from "../types/assistant"

/**
 * Framework-agnostic chat-path logic shared by the web hook and the extension
 * chat so branch/optimistic behaviour (incl. the edit-no-flicker fix) cannot
 * diverge between surfaces.
 */
export interface UiToolStep {
  label: string
  status: "active" | "complete" | "pending"
  startedAt?: string
  completedAt?: string
  durationMs?: number
}

export interface UiUsage {
  totalTokens: number
  maxContextTokens?: number
  model?: string
}

export interface UiMessage {
  id: string
  parentId: string | null
  role: "user" | "assistant"
  content: string
  toolName?: string | null
  actionResults: AssistantActionResult[]
  attachments: AssistantAttachmentDto[]
  feedback: AssistantMessageFeedback | null
  /** @deprecated use pendingActions */
  pending?: AssistantPendingAction
  pendingActions: AssistantPendingAction[]
  /** Set when the agent hit its step budget. UI renders a Continue button so
   * the user resumes without re-typing. */
  pendingContinuation?: { reason: "step_limit" }
  streaming?: boolean
  /** 1-based position + total among sibling branches at this point. */
  branch?: { index: number; total: number; siblingIds: string[] }
  toolSteps: UiToolStep[]
  usage?: UiUsage
}

export const chatKeyOf = (parentId: string | null) => parentId ?? "root"

function actionResultKey(result: AssistantActionResult): string {
  const itemIds = result.items.map((item) => item.id ?? item.label).join("|")
  return `${result.tool}:${result.action}:${result.count}:${itemIds}`
}

/** Skip duplicate cards when action_update and tool_result stream the same write. */
export function appendActionResult(
  existing: AssistantActionResult[],
  next: AssistantActionResult,
): AssistantActionResult[] {
  const key = actionResultKey(next)
  if (existing.some((result) => actionResultKey(result) === key)) return existing
  return [...existing, next]
}

/** Filter pending actions that should still be rendered in the UI.
 * Declined actions are hidden immediately. Succeeded/failed stay visible
 * during their dwell window (until moved to actionResults by the stream handler). */
export function filterRenderablePendingActions(
  pendingActions: AssistantPendingAction[],
): AssistantPendingAction[] {
  return pendingActions.filter((pending) => pending.status !== "declined")
}

/** Hide completed pending-action chrome once the structured tool result card exists.
 * @deprecated use filterRenderablePendingActions */
export function shouldRenderPendingAction(
  pending: AssistantPendingAction | undefined,
  _actionResults: AssistantActionResult[] = [],
): pending is AssistantPendingAction {
  if (!pending) return false
  if (
    pending.status === "succeeded" ||
    pending.status === "failed" ||
    pending.status === "declined"
  ) {
    return false
  }
  if (pending.result) return false
  return !pending.status || pending.status === "pending" || pending.status === "running"
}

/** Drop duplicate cards on ancestor pending_action rows when a later assistant
 * message already carries the aggregated turn results. */
export function suppressActionResultsOnPendingRows(nodes: UiMessage[]): UiMessage[] {
  let downstreamHasAggregated = false
  return [...nodes]
    .reverse()
    .map((node) => {
      if (downstreamHasAggregated && node.toolName === "pending_action") {
        return { ...node, actionResults: [] }
      }
      if (
        node.role === "assistant" &&
        node.toolName !== "pending_action" &&
        node.actionResults.length > 0
      ) {
        downstreamHasAggregated = true
      }
      return node
    })
    .reverse()
}

export function derivePath(
  nodes: AssistantMessageDto[],
  selections: Record<string, string>
): { nodes: UiMessage[]; leafId: string | null } {
  if (nodes.length === 0) return { nodes: [], leafId: null }
  const byParent = new Map<string, AssistantMessageDto[]>()
  for (const n of nodes) {
    const k = chatKeyOf(n.parentId)
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
      actionResults?: AssistantActionResult[]
    }
    const chosenPending = chosen.pending ?? undefined
    out.push({
      id: chosen.id,
      parentId: chosen.parentId,
      role: chosen.role === "user" ? "user" : "assistant",
      content: chosen.content,
      toolName: chosen.toolName,
      actionResults:
        payload.actionResults ?? (payload.actionResult ? [payload.actionResult] : []),
      attachments: chosen.attachments ?? [],
      feedback: chosen.feedback,
      pending: chosenPending,
      pendingActions: chosen.pendingActions ?? (chosenPending ? [chosenPending] : []),
      toolSteps: chosen.toolSteps ?? [],
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
  return { nodes: suppressActionResultsOnPendingRows(out), leafId }
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
