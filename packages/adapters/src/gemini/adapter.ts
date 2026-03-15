import type {
  PageMetadata,
  PageRouteKind,
  ParsedTurn,
} from "@relay/shared/types/capture"

import { BaseSiteAdapter } from "../base/site-adapter"
import { collectTurns, findPrompt, injectText } from "../base/dom-utils"
import { geminiPromptSelectors, geminiTurnSelectors } from "./selectors"

function resolveRouteKind(pathname: string): PageRouteKind {
  if (pathname === "/app" || pathname === "/app/") {
    return "fresh"
  }

  if (/^\/prompts\/new/.test(pathname)) {
    return "fresh"
  }

  if (/^\/gems\/[^/]+/.test(pathname)) {
    return "project_root"
  }

  if (/^\/app\/[^/]+/.test(pathname)) {
    return "chat"
  }

  if (/^\/prompts\/[^/]+/.test(pathname)) {
    return "chat"
  }

  return "fresh"
}

export class GeminiAdapter extends BaseSiteAdapter {
  canHandle(url: string): boolean {
    return /gemini\.google\.com|aistudio\.google\.com/.test(url)
  }

  getPlatform() {
    return "gemini" as const
  }

  extractVisibleTurns(doc = document): ParsedTurn[] {
    return collectTurns(doc, geminiTurnSelectors, (node) => {
      const tag = node.tagName?.toLowerCase() ?? ""
      if (tag === "user-query" || node.getAttribute("data-message-id")?.startsWith("user")) {
        return "user"
      }
      if (tag === "model-response") {
        return "assistant"
      }
      const role = node.getAttribute("data-message-author-role") ?? node.getAttribute("data-role")
      if (role === "user") return "user"
      if (role === "model" || role === "assistant") return "assistant"
      return "assistant"
    }).map(({ contentHash: _contentHash, ...turn }) => turn)
  }

  findPromptInput(doc = document) {
    return findPrompt(doc, geminiPromptSelectors)
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
      domain: url.hostname,
      routeKind: resolveRouteKind(url.pathname),
    }
  }
}
