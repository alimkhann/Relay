/**
 * Types for the MAIN world network interception layer.
 *
 * These define the postMessage contract between the MAIN world
 * (network-intercept content script) and the ISOLATED world
 * (relay-content.js).
 */

export type NetworkPlatform = "chatgpt" | "claude" | "perplexity" | "codex" | "gemini" | "grok" | "deepseek"

export interface NetworkTurn {
  role: "user" | "assistant" | "system"
  content: string
  turnIndex: number
}

/**
 * Message posted from MAIN world → ISOLATED world via window.postMessage.
 * The ISOLATED world listener filters by `type === "RELAY_NETWORK_CAPTURE"`.
 */
export interface NetworkCaptureMessage {
  type: "RELAY_NETWORK_CAPTURE"
  payload: {
    platform: NetworkPlatform
    conversationId: string | null
    title: string | null
    url: string
    turns: NetworkTurn[]
    capturedAt: number
  }
}

/**
 * URL pattern matcher result used internally by the intercept layer.
 */
export interface InterceptMatch {
  platform: NetworkPlatform
  conversationId: string | null
}
