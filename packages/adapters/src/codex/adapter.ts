import type { PageMetadata, ParsedTurn } from "@relay/shared/types/capture"

import { BaseSiteAdapter } from "../base/site-adapter"
import { collectTurns, findPrompt, injectText } from "../base/dom-utils"
import { codexPromptSelectors, codexTurnSelectors } from "./selectors"

function isCodexRoute(url: URL) {
  return (
    url.hostname === "codex.openai.com" ||
    url.pathname === "/codex" ||
    url.pathname.startsWith("/codex/")
  )
}

export class CodexAdapter extends BaseSiteAdapter {
  canHandle(url: string): boolean {
    return isCodexRoute(new URL(url))
  }

  getPlatform() {
    return "codex" as const
  }

  extractVisibleTurns(doc = document): ParsedTurn[] {
    return collectTurns(doc, codexTurnSelectors).map(({ contentHash: _contentHash, ...turn }) => turn)
  }

  findPromptInput(doc = document) {
    return findPrompt(doc, codexPromptSelectors)
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
      pageFingerprint: url.pathname.split("/").filter(Boolean).pop() ?? null,
      domain: url.hostname
    }
  }
}
