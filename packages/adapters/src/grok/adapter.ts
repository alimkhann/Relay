import type {
  PageMetadata,
  PageRouteKind,
  ParsedTurn,
} from "@relay/shared/types/capture"

import { BaseSiteAdapter } from "../base/site-adapter"
import { collectTurns, findPrompt, injectText } from "../base/dom-utils"
import { grokPromptSelectors, grokTurnSelectors } from "./selectors"

export class GrokAdapter extends BaseSiteAdapter {
  canHandle(url: string): boolean {
    return /grok\.com|x\.com\/i\/grok/.test(url)
  }

  getPlatform() {
    return "grok" as const
  }

  extractVisibleTurns(doc = document): ParsedTurn[] {
    const turns = collectTurns(doc, grokTurnSelectors, (node) => {
      // Legacy data attributes
      const role = node.getAttribute("data-message-role") ?? node.getAttribute("data-testid")
      if (role === "user" || role === "user-message") return "user"
      if (role === "assistant" || role === "model") return "assistant"
      // Current Grok: .message-bubble — mark as unknown for index-based fallback
      return "unknown"
    }).map(({ contentHash: _contentHash, ...turn }) => turn)

    // If all roles are unknown (current Grok), alternate user/assistant
    const allUnknown = turns.length > 0 && turns.every((t) => t.role === "unknown")
    if (allUnknown) {
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i]!
        turn.role = i % 2 === 0 ? "user" : "assistant"
      }
    }

    return turns
  }

  findPromptInput(doc = document) {
    return findPrompt(doc, grokPromptSelectors)
  }

  async insertTextIntoPrompt(text: string, doc = document) {
    const target = this.findPromptInput(doc)
    return target ? injectText(target, text) : { ok: false, reason: "Prompt not found." }
  }

  getPageMetadata(doc = document): PageMetadata {
    const url = new URL(doc.location.href)
    const routeKind: PageRouteKind = url.pathname === "/" || url.pathname === "/i/grok" ? "fresh" : "chat"
    return {
      title: doc.title,
      url: url.toString(),
      pathname: url.pathname,
      pageFingerprint: url.pathname.split("/").pop() ?? null,
      domain: url.hostname,
      routeKind,
    }
  }
}
