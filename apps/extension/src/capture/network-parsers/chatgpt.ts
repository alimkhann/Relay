/**
 * ChatGPT network response parser.
 *
 * Intercepts GET /backend-api/conversation/{id} responses which return
 * the full conversation with all messages in a `mapping` object.
 *
 * Response shape (simplified):
 * {
 *   title: string,
 *   mapping: {
 *     [nodeId]: {
 *       message: {
 *         author: { role: "user" | "assistant" | "system" | "tool" },
 *         content: {
 *           content_type: "text" | "code" | ...,
 *           parts: string[]
 *         },
 *         create_time: number
 *       },
 *       parent: string | null,
 *       children: string[]
 *     }
 *   }
 * }
 *
 * We walk the mapping tree from root to leaf along the main branch
 * (following the last child at each node) to reconstruct turn order.
 */

import type { NetworkTurn, InterceptMatch } from "../network-types"

const CONVERSATION_URL_RE =
  /\/backend-api\/conversation\/([0-9a-f-]{36})(?:\?|$)/

export function matchChatGPT(url: string): InterceptMatch | null {
  const match = CONVERSATION_URL_RE.exec(url)
  if (!match) return null
  return { platform: "chatgpt", conversationId: match[1] ?? null }
}

interface ChatGPTMessage {
  author?: { role?: string }
  content?: { content_type?: string; parts?: unknown[] }
  create_time?: number
}

interface ChatGPTNode {
  message?: ChatGPTMessage | null
  parent?: string | null
  children?: string[]
}

interface ChatGPTConversation {
  title?: string
  mapping?: Record<string, ChatGPTNode>
}

function extractTextFromParts(parts: unknown[]): string {
  return parts
    .filter((p): p is string => typeof p === "string")
    .join("\n")
    .trim()
}

function normalizeRole(
  role: string | undefined,
): "user" | "assistant" | "system" {
  if (role === "user") return "user"
  if (role === "assistant") return "assistant"
  return "system"
}

/**
 * Walk the mapping tree to get an ordered list of message nodes.
 * We follow the "main branch" — at each node, take the last child
 * (ChatGPT keeps the active branch as the last child).
 */
function walkMainBranch(
  mapping: Record<string, ChatGPTNode>,
): ChatGPTNode[] {
  // Find root node (no parent or parent not in mapping)
  let rootId: string | null = null
  for (const [id, node] of Object.entries(mapping)) {
    if (!node.parent || !(node.parent in mapping)) {
      rootId = id
      break
    }
  }

  if (!rootId) return []

  const ordered: ChatGPTNode[] = []
  let currentId: string | null = rootId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const current: ChatGPTNode | undefined = mapping[currentId]
    if (!current) break
    ordered.push(current)
    const kids: string[] = current.children ?? []
    currentId = kids.length > 0 ? kids[kids.length - 1]! : null
  }

  return ordered
}

export function parseChatGPTConversation(
  data: unknown,
): { title: string | null; turns: NetworkTurn[] } | null {
  if (!data || typeof data !== "object") return null

  const conv = data as ChatGPTConversation
  if (!conv.mapping || typeof conv.mapping !== "object") return null

  const nodes = walkMainBranch(conv.mapping)
  const turns: NetworkTurn[] = []
  let turnIndex = 0

  for (const node of nodes) {
    const msg = node.message
    if (!msg) continue

    const role = normalizeRole(msg.author?.role)
    // Skip system messages and tool messages that aren't useful
    if (role === "system") continue

    const parts = msg.content?.parts
    if (!parts || !Array.isArray(parts)) continue

    const content = extractTextFromParts(parts)
    if (!content) continue

    turns.push({ role, content, turnIndex })
    turnIndex++
  }

  return { title: conv.title ?? null, turns }
}
