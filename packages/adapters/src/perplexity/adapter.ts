import type {
  PageMetadata,
  PageRouteKind,
  ParsedTurn,
} from "@relay/shared/types/capture"

import { BaseSiteAdapter } from "../base/site-adapter"
import { collectTurns, findPrompt, injectText } from "../base/dom-utils"
import { perplexityPromptSelectors, perplexityTurnSelectors } from "./selectors"

export class PerplexityAdapter extends BaseSiteAdapter {
  canHandle(url: string): boolean {
    return /perplexity\.ai/.test(url)
  }

  getPlatform() {
    return "perplexity" as const
  }

  extractVisibleTurns(doc = document): ParsedTurn[] {
    return collectTurns(doc, perplexityTurnSelectors, (node) =>
      node.getAttribute("data-testid") === "query" ? "user" : "assistant"
    ).map(({ contentHash: _contentHash, ...turn }) => turn)
  }

  findPromptInput(doc = document) {
    return findPrompt(doc, perplexityPromptSelectors)
  }

  async insertTextIntoPrompt(text: string, doc = document) {
    const target = this.findPromptInput(doc)
    return target ? injectText(target, text) : { ok: false, reason: "Prompt not found." }
  }

  getPageMetadata(doc = document): PageMetadata {
    const url = new URL(doc.location.href)
    const routeKind: PageRouteKind =
      url.pathname === "/" || url.pathname === "/search" || url.pathname === "/home"
        ? "fresh"
        : "chat"
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
