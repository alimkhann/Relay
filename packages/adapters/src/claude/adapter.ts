import type { PageMetadata, ParsedTurn } from "@relay/shared/types/capture"

import { BaseSiteAdapter } from "../base/site-adapter"
import { collectTurns, findPrompt, injectText } from "../base/dom-utils"
import { claudePromptSelectors, claudeTurnSelectors } from "./selectors"

export class ClaudeAdapter extends BaseSiteAdapter {
  canHandle(url: string): boolean {
    return /claude\.ai/.test(url)
  }

  getPlatform() {
    return "claude" as const
  }

  extractVisibleTurns(doc = document): ParsedTurn[] {
    return collectTurns(doc, claudeTurnSelectors, (node) => {
      if (node.getAttribute("data-testid") === "message-human") {
        return "user"
      }

      return "assistant"
    }).map(({ contentHash: _contentHash, ...turn }) => turn)
  }

  findPromptInput(doc = document) {
    return findPrompt(doc, claudePromptSelectors)
  }

  async insertTextIntoPrompt(text: string, doc = document) {
    const target = this.findPromptInput(doc)
    return target ? injectText(target, text) : { ok: false, reason: "Prompt not found." }
  }

  getPageMetadata(doc = document): PageMetadata {
    const url = new URL(doc.location.href)
    return {
      title: doc.title,
      url: url.toString(),
      pathname: url.pathname,
      pageFingerprint: url.pathname.split("/").pop() ?? null,
      domain: url.hostname
    }
  }
}
