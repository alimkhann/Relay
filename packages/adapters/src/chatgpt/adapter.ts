import type { PageMetadata, ParsedTurn } from "@relay/shared"

import { BaseSiteAdapter } from "../base/site-adapter"
import { collectTurns, findPrompt, injectText } from "../base/dom-utils"
import { chatgptPromptSelectors, chatgptTurnSelectors } from "./selectors"

export class ChatgptAdapter extends BaseSiteAdapter {
  canHandle(url: string): boolean {
    return /chatgpt\.com|chat\.openai\.com/.test(url)
  }

  getPlatform() {
    return "chatgpt" as const
  }

  extractVisibleTurns(doc = document): ParsedTurn[] {
    return collectTurns(doc, chatgptTurnSelectors).map(({ contentHash: _contentHash, ...turn }) => turn)
  }

  findPromptInput(doc = document) {
    return findPrompt(doc, chatgptPromptSelectors)
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
