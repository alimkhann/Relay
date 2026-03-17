/**
 * Grok network response parser.
 *
 * Grok runs on grok.com and x.com/i/grok. It uses a REST API
 * for conversation history, likely under patterns like:
 *   - GET /rest/app-chat/conversations/{id}
 *   - GET /api/conversations/{id}
 *   - GET /i/api/graphql/* (X/Twitter GraphQL variant)
 *
 * Response shape (expected):
 * {
 *   conversation_id: string,
 *   title: string,
 *   messages: [
 *     { role: "user" | "assistant", content: string, ... }
 *   ]
 * }
 *
 * Also handles nested response shapes where messages might be
 * under a `result` or `data` wrapper.
 */

import type { NetworkTurn, InterceptMatch } from "../network-types"

const CONVERSATION_RE =
  /\/(?:rest\/app-chat\/)?conversations?\/([a-zA-Z0-9_-]+)(?:\?|$)/

const GROK_API_RE =
  /\/(?:api|rest)\/(?:app-chat|grok)\/(?:conversations?|history|messages)/

export function matchGrok(url: string): InterceptMatch | null {
  const convMatch = CONVERSATION_RE.exec(url)
  if (convMatch) {
    return { platform: "grok", conversationId: convMatch[1] ?? null }
  }

  if (GROK_API_RE.test(url)) {
    return { platform: "grok", conversationId: null }
  }

  return null
}

interface GrokMessage {
  role?: string
  sender?: string
  content?: string
  text?: string
  message?: string
}

interface GrokConversation {
  title?: string
  name?: string
  conversation_id?: string
  messages?: GrokMessage[]
  result?: {
    messages?: GrokMessage[]
    title?: string
  }
  data?: {
    messages?: GrokMessage[]
    title?: string
    conversation?: {
      messages?: GrokMessage[]
      title?: string
    }
  }
}

function normalizeRole(role: string | undefined): "user" | "assistant" {
  if (role === "user" || role === "human") return "user"
  return "assistant"
}

function extractText(msg: GrokMessage): string {
  if (typeof msg.content === "string") return msg.content.trim()
  if (typeof msg.text === "string") return msg.text.trim()
  if (typeof msg.message === "string") return msg.message.trim()
  return ""
}

function parseMessageArray(
  messages: GrokMessage[],
  title: string | null,
): { title: string | null; turns: NetworkTurn[] } | null {
  const turns: NetworkTurn[] = []
  let turnIndex = 0

  for (const msg of messages) {
    const content = extractText(msg)
    if (!content) continue

    turns.push({
      role: normalizeRole(msg.role ?? msg.sender),
      content,
      turnIndex,
    })
    turnIndex++
  }

  if (turns.length === 0) return null
  return { title, turns }
}

export function parseGrokConversation(
  data: unknown,
): { title: string | null; turns: NetworkTurn[] } | null {
  if (!data || typeof data !== "object") return null

  const conv = data as GrokConversation

  // Direct messages array
  if (conv.messages && Array.isArray(conv.messages)) {
    return parseMessageArray(
      conv.messages,
      conv.title ?? conv.name ?? null,
    )
  }

  // Wrapped in result
  if (conv.result?.messages && Array.isArray(conv.result.messages)) {
    return parseMessageArray(
      conv.result.messages,
      conv.result.title ?? conv.title ?? null,
    )
  }

  // Wrapped in data
  if (conv.data?.messages && Array.isArray(conv.data.messages)) {
    return parseMessageArray(
      conv.data.messages,
      conv.data.title ?? conv.title ?? null,
    )
  }

  // Wrapped in data.conversation
  if (conv.data?.conversation?.messages && Array.isArray(conv.data.conversation.messages)) {
    return parseMessageArray(
      conv.data.conversation.messages,
      conv.data.conversation.title ?? conv.title ?? null,
    )
  }

  return null
}
