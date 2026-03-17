/**
 * Claude network response parser.
 *
 * Intercepts GET /api/organizations/{org}/chat_conversations/{id}
 * responses which return the full conversation.
 *
 * Response shape (simplified):
 * {
 *   uuid: string,
 *   name: string,
 *   chat_messages: [
 *     {
 *       uuid: string,
 *       sender: "human" | "assistant",
 *       text: string,
 *       content: [{ type: "text", text: string }, ...],
 *       created_at: string,
 *       index: number
 *     }
 *   ]
 * }
 */

import type { NetworkTurn, InterceptMatch } from "../network-types"

const CONVERSATION_URL_RE =
  /\/api\/organizations\/[^/]+\/chat_conversations\/([0-9a-f-]{36})(?:\?|$)/

export function matchClaude(url: string): InterceptMatch | null {
  const match = CONVERSATION_URL_RE.exec(url)
  if (!match) return null
  return { platform: "claude", conversationId: match[1] ?? null }
}

interface ClaudeContentBlock {
  type?: string
  text?: string
}

interface ClaudeMessage {
  sender?: string
  text?: string
  content?: ClaudeContentBlock[]
  index?: number
}

interface ClaudeConversation {
  name?: string
  chat_messages?: ClaudeMessage[]
}

function normalizeRole(sender: string | undefined): "user" | "assistant" {
  return sender === "human" ? "user" : "assistant"
}

function extractText(msg: ClaudeMessage): string {
  // Prefer the content blocks array if present
  if (msg.content && Array.isArray(msg.content)) {
    const texts = msg.content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text!)
    if (texts.length > 0) return texts.join("\n").trim()
  }

  // Fall back to top-level text field
  if (typeof msg.text === "string") return msg.text.trim()

  return ""
}

export function parseClaudeConversation(
  data: unknown,
): { title: string | null; turns: NetworkTurn[] } | null {
  if (!data || typeof data !== "object") return null

  const conv = data as ClaudeConversation
  if (!conv.chat_messages || !Array.isArray(conv.chat_messages)) return null

  const turns: NetworkTurn[] = []

  for (let i = 0; i < conv.chat_messages.length; i++) {
    const msg = conv.chat_messages[i]!
    const content = extractText(msg)
    if (!content) continue

    turns.push({
      role: normalizeRole(msg.sender),
      content,
      turnIndex: i,
    })
  }

  return { title: conv.name ?? null, turns }
}
