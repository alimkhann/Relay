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
    return collectTurns(doc, grokTurnSelectors, (node) => {
      const role = node.getAttribute("data-message-role") ?? node.getAttribute("data-testid")
      if (role === "user" || role === "user-message") return "user"
      return "assistant"
    }).map(({ contentHash: _contentHash, ...turn }) => turn)
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
