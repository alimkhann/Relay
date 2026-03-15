import type {
  PageMetadata,
  PageRouteKind,
  ParsedTurn,
} from "@relay/shared/types/capture"

import { BaseSiteAdapter } from "../base/site-adapter"
import { collectTurns, findPrompt, injectText } from "../base/dom-utils"
import { deepseekPromptSelectors, deepseekTurnSelectors } from "./selectors"

export class DeepseekAdapter extends BaseSiteAdapter {
  canHandle(url: string): boolean {
    return /chat\.deepseek\.com/.test(url)
  }

  getPlatform() {
    return "deepseek" as const
  }

  extractVisibleTurns(doc = document): ParsedTurn[] {
    return collectTurns(doc, deepseekTurnSelectors, (node) => {
      const role = node.getAttribute("data-message-role")
      if (role === "user") return "user"
      if (role === "assistant") return "assistant"
      if (node.classList.contains("chat-message-user")) return "user"
      if (node.classList.contains("chat-message-assistant")) return "assistant"
      return "assistant"
    }).map(({ contentHash: _contentHash, ...turn }) => turn)
  }

  findPromptInput(doc = document) {
    return findPrompt(doc, deepseekPromptSelectors)
  }

  async insertTextIntoPrompt(text: string, doc = document) {
    const target = this.findPromptInput(doc)
    return target ? injectText(target, text) : { ok: false, reason: "Prompt not found." }
  }

  getPageMetadata(doc = document): PageMetadata {
    const url = new URL(doc.location.href)
    const routeKind: PageRouteKind = url.pathname === "/" ? "fresh" : "chat"
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
