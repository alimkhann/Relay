/**
 * Codex network response parser.
 *
 * Codex (codex.openai.com) is an OpenAI product that uses the same
 * backend API as ChatGPT: GET /backend-api/conversation/{id}.
 *
 * The response shape is identical to ChatGPT — a tree-based `mapping`
 * object with message nodes linked via parent/children pointers.
 *
 * We reuse the same parsing logic as ChatGPT but return platform: "codex".
 */

import type { NetworkTurn, InterceptMatch } from "../network-types"

/**
 * Codex uses the same /backend-api/conversation/{uuid} endpoint as ChatGPT.
 * We distinguish by hostname at the caller level — this matcher only checks
 * the URL path.
 */
const CONVERSATION_URL_RE =
  /\/backend-api\/conversation\/([0-9a-f-]{36})(?:\?|$)/

export function matchCodex(url: string): InterceptMatch | null {
  const match = CONVERSATION_URL_RE.exec(url)
  if (!match) return null
  return { platform: "codex", conversationId: match[1] ?? null }
}

interface CodexMessage {
  author?: { role?: string }
  content?: { content_type?: string; parts?: unknown[] }
  create_time?: number
}

interface CodexNode {
  message?: CodexMessage | null
  parent?: string | null
  children?: string[]
}

interface CodexConversation {
  title?: string
  mapping?: Record<string, CodexNode>
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
 * Same algorithm as ChatGPT: follow the last child at each node.
 */
function walkMainBranch(
  mapping: Record<string, CodexNode>,
): CodexNode[] {
  let rootId: string | null = null
  for (const [id, node] of Object.entries(mapping)) {
    if (!node.parent || !(node.parent in mapping)) {
      rootId = id
      break
    }
  }

  if (!rootId) return []

  const ordered: CodexNode[] = []
  let currentId: string | null = rootId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const current: CodexNode | undefined = mapping[currentId]
    if (!current) break
    ordered.push(current)
    const kids: string[] = current.children ?? []
    currentId = kids.length > 0 ? kids[kids.length - 1]! : null
  }

  return ordered
}

export function parseCodexConversation(
  data: unknown,
): { title: string | null; turns: NetworkTurn[] } | null {
  if (!data || typeof data !== "object") return null

  const conv = data as CodexConversation
  if (!conv.mapping || typeof conv.mapping !== "object") return null

  const nodes = walkMainBranch(conv.mapping)
  const turns: NetworkTurn[] = []
  let turnIndex = 0

  for (const node of nodes) {
    const msg = node.message
    if (!msg) continue

    const role = normalizeRole(msg.author?.role)
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
