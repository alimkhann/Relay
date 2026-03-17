/**
 * DeepSeek network response parser.
 *
 * DeepSeek (chat.deepseek.com) follows OpenAI-compatible conventions.
 * Conversation history is loaded via GET requests to endpoints like:
 *   - GET /api/v0/chat/{conversation_id}
 *   - GET /api/v0/chat/history/{conversation_id}
 *   - GET /api/chat/history
 *
 * Response shape (expected):
 * {
 *   data: {
 *     title: string,
 *     chat_messages: [
 *       { role: "user" | "assistant", content: string, ... }
 *     ]
 *   }
 * }
 *
 * Or flatter shape:
 * {
 *   title: string,
 *   messages: [{ role, content }]
 * }
 *
 * DeepSeek also uses a thinking/reasoning format where assistant
 * messages may contain `<think>...</think>` blocks.
 */

import type { NetworkTurn, InterceptMatch } from "../network-types"

const CHAT_HISTORY_RE =
  /\/api\/v\d+\/chat(?:\/history)?\/([a-zA-Z0-9_-]+)(?:\?|$)/

const CHAT_API_RE =
  /\/api\/(?:v\d+\/)?(?:chat|conversation)(?:\/history|\/messages)?(?:\?|$)/

export function matchDeepSeek(url: string): InterceptMatch | null {
  const historyMatch = CHAT_HISTORY_RE.exec(url)
  if (historyMatch) {
    return { platform: "deepseek", conversationId: historyMatch[1] ?? null }
  }

  if (CHAT_API_RE.test(url)) {
    return { platform: "deepseek", conversationId: null }
  }

  return null
}

interface DeepSeekMessage {
  role?: string
  content?: string
  message?: string
  text?: string
}

interface DeepSeekConversation {
  title?: string
  messages?: DeepSeekMessage[]
  chat_messages?: DeepSeekMessage[]
  data?: {
    title?: string
    messages?: DeepSeekMessage[]
    chat_messages?: DeepSeekMessage[]
    biz_data?: {
      title?: string
      chat_messages?: DeepSeekMessage[]
    }
  }
}

function normalizeRole(role: string | undefined): "user" | "assistant" {
  if (role === "user") return "user"
  return "assistant"
}

function extractContent(msg: DeepSeekMessage): string {
  const raw =
    typeof msg.content === "string"
      ? msg.content
      : typeof msg.message === "string"
        ? msg.message
        : typeof msg.text === "string"
          ? msg.text
          : ""

  // Strip <think>...</think> blocks from reasoning models —
  // we keep only the final answer for the capture layer
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
}

function parseMessageArray(
  messages: DeepSeekMessage[],
  title: string | null,
): { title: string | null; turns: NetworkTurn[] } | null {
  const turns: NetworkTurn[] = []
  let turnIndex = 0

  for (const msg of messages) {
    const content = extractContent(msg)
    if (!content) continue

    turns.push({
      role: normalizeRole(msg.role),
      content,
      turnIndex,
    })
    turnIndex++
  }

  if (turns.length === 0) return null
  return { title, turns }
}

export function parseDeepSeekConversation(
  data: unknown,
): { title: string | null; turns: NetworkTurn[] } | null {
  if (!data || typeof data !== "object") return null

  const conv = data as DeepSeekConversation

  // Direct messages array
  const directMessages = conv.messages ?? conv.chat_messages
  if (directMessages && Array.isArray(directMessages)) {
    return parseMessageArray(directMessages, conv.title ?? null)
  }

  // Wrapped in data
  if (conv.data) {
    const dataMessages = conv.data.messages ?? conv.data.chat_messages
    if (dataMessages && Array.isArray(dataMessages)) {
      return parseMessageArray(
        dataMessages,
        conv.data.title ?? conv.title ?? null,
      )
    }

    // Wrapped in data.biz_data (DeepSeek-specific nesting)
    if (conv.data.biz_data?.chat_messages && Array.isArray(conv.data.biz_data.chat_messages)) {
      return parseMessageArray(
        conv.data.biz_data.chat_messages,
        conv.data.biz_data.title ?? conv.title ?? null,
      )
    }
  }

  return null
}
