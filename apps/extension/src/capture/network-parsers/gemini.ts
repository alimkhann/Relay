/**
 * Gemini network response parser.
 *
 * Gemini (gemini.google.com / aistudio.google.com) uses Google's internal
 * API with several possible response formats:
 *
 * 1. Batched RPC format: POST /$rpc/google.internal.* — protobuf-like
 *    nested arrays (hard to parse reliably, we focus on JSON responses)
 *
 * 2. Conversation history endpoint patterns:
 *    - GET /api/conversation/{id}
 *    - POST /_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate
 *    - GET /v1beta/models/{model}/generateContent (AI Studio)
 *
 * 3. Thread/history load patterns matching common Google API conventions:
 *    - /api/threads/{id}
 *    - /api/history/{id}
 *
 * We intercept GET requests that return JSON conversation data and do
 * best-effort parsing of multiple known response shapes.
 */

import type { NetworkTurn, InterceptMatch } from "../network-types"

/**
 * Match Gemini conversation/history API endpoints.
 * We're generous with URL matching since Google changes endpoints frequently.
 */
const CONVERSATION_RE =
  /\/(?:api\/)?(?:conversations?|threads?|history|chats?)\/([a-zA-Z0-9_-]+)(?:\?|$)/

const GENERATE_CONTENT_RE =
  /\/v1(?:beta)?\/models\/[^/]+\/generateContent/

export function matchGemini(url: string): InterceptMatch | null {
  const convMatch = CONVERSATION_RE.exec(url)
  if (convMatch) {
    return { platform: "gemini", conversationId: convMatch[1] ?? null }
  }

  if (GENERATE_CONTENT_RE.test(url)) {
    return { platform: "gemini", conversationId: null }
  }

  return null
}

// ─── Response Shape Variants ────────────────────────────────────────

/**
 * Shape 1: Array of messages with role/content (AI Studio / generateContent)
 * { candidates: [{ content: { parts: [{ text }], role: "model" } }] }
 * with the request containing { contents: [{ role, parts }] }
 */
interface GeminiCandidate {
  content?: {
    role?: string
    parts?: Array<{ text?: string }>
  }
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[]
  contents?: Array<{
    role?: string
    parts?: Array<{ text?: string }>
  }>
}

/**
 * Shape 2: Conversation history with messages array
 * { title: string, messages: [{ role, content, ... }] }
 */
interface GeminiHistoryMessage {
  role?: string
  author?: string
  content?: string | Array<{ text?: string }>
  text?: string
  parts?: Array<{ text?: string }>
}

interface GeminiHistoryResponse {
  title?: string
  name?: string
  messages?: GeminiHistoryMessage[]
  conversation?: GeminiHistoryMessage[]
  turns?: GeminiHistoryMessage[]
}

function normalizeRole(role: string | undefined): "user" | "assistant" {
  if (role === "user" || role === "human") return "user"
  return "assistant" // "model", "assistant", "gemini", etc.
}

function extractMessageText(msg: GeminiHistoryMessage): string {
  // Direct text field
  if (typeof msg.text === "string") return msg.text.trim()

  // String content field
  if (typeof msg.content === "string") return msg.content.trim()

  // Array content field with text parts
  if (Array.isArray(msg.content)) {
    const texts = msg.content
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text!)
    if (texts.length > 0) return texts.join("\n").trim()
  }

  // Parts array
  if (Array.isArray(msg.parts)) {
    const texts = msg.parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text!)
    if (texts.length > 0) return texts.join("\n").trim()
  }

  return ""
}

function tryParseHistoryFormat(
  data: GeminiHistoryResponse,
): { title: string | null; turns: NetworkTurn[] } | null {
  const messages = data.messages ?? data.conversation ?? data.turns
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return null
  }

  const turns: NetworkTurn[] = []
  let turnIndex = 0

  for (const msg of messages) {
    const content = extractMessageText(msg)
    if (!content) continue

    const role = normalizeRole(msg.role ?? msg.author)
    turns.push({ role, content, turnIndex })
    turnIndex++
  }

  if (turns.length === 0) return null
  return { title: data.title ?? data.name ?? null, turns }
}

function tryParseGenerateFormat(
  data: GeminiGenerateResponse,
): { title: string | null; turns: NetworkTurn[] } | null {
  if (!data.candidates || !Array.isArray(data.candidates)) return null

  const turns: NetworkTurn[] = []
  let turnIndex = 0

  // If there are input contents (from the cached request), add those first
  if (data.contents && Array.isArray(data.contents)) {
    for (const content of data.contents) {
      const parts = content.parts
      if (!parts || !Array.isArray(parts)) continue
      const text = parts
        .filter((p) => typeof p.text === "string")
        .map((p) => p.text!)
        .join("\n")
        .trim()
      if (!text) continue
      turns.push({
        role: normalizeRole(content.role),
        content: text,
        turnIndex,
      })
      turnIndex++
    }
  }

  // Add candidate responses
  for (const candidate of data.candidates) {
    const parts = candidate.content?.parts
    if (!parts || !Array.isArray(parts)) continue
    const text = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text!)
      .join("\n")
      .trim()
    if (!text) continue
    turns.push({
      role: normalizeRole(candidate.content?.role),
      content: text,
      turnIndex,
    })
    turnIndex++
  }

  if (turns.length === 0) return null
  return { title: null, turns }
}

export function parseGeminiConversation(
  data: unknown,
): { title: string | null; turns: NetworkTurn[] } | null {
  if (!data || typeof data !== "object") return null

  // Try history/conversation format first (more complete)
  const historyResult = tryParseHistoryFormat(
    data as GeminiHistoryResponse,
  )
  if (historyResult) return historyResult

  // Try generateContent format
  const generateResult = tryParseGenerateFormat(
    data as GeminiGenerateResponse,
  )
  if (generateResult) return generateResult

  return null
}
