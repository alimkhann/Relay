import type {
  AssistantActionResult,
  AssistantMessageDto,
  AssistantMessageFeedback,
  AssistantPendingAction
} from "../types/assistant"

/**
 * Framework-agnostic chat-path logic shared by the web hook and the extension
 * chat so branch/optimistic behaviour (incl. the edit-no-flicker fix) cannot
 * diverge between surfaces.
 */
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

export const chatKeyOf = (parentId: string | null) => parentId ?? "root"

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
    out.push({
      id: chosen.id,
      parentId: chosen.parentId,
      role: chosen.role === "user" ? "user" : "assistant",
      content: chosen.content,
      actionResults:
        payload.actionResults ?? (payload.actionResult ? [payload.actionResult] : []),
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
