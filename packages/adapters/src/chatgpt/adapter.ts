import type {
  PageMetadata,
  PageRouteKind,
  ParsedTurn,
} from "@relay/shared/types/capture"

import { BaseSiteAdapter } from "../base/site-adapter"
import { collectTurns, findPrompt, injectText } from "../base/dom-utils"
import { chatgptPromptSelectors, chatgptTurnSelectors } from "./selectors"

function isCodexRoute(url: URL) {
  return (
    url.hostname === "codex.openai.com" ||
    url.pathname === "/codex" ||
    url.pathname.startsWith("/codex/")
  )
}

function resolveRouteKind(pathname: string): PageRouteKind {
  if (pathname === "/") {
    return "fresh"
  }

  // /g/{id}/project/ — project settings page
  if (/^\/g\/[^/]+\/project\/?$/.test(pathname)) {
    return "project_root"
  }

  // /g/{id} — project directory/listing page (no /c/ or /project/ suffix)
  if (/^\/g\/[^/]+\/?$/.test(pathname)) {
    return "project_root"
  }

  return "chat"
}

function resolvePageFingerprint(url: URL, routeKind: PageRouteKind) {
  const parts = url.pathname.split("/").filter(Boolean)
  if (routeKind === "project_root") {
    return parts[0] === "g" && parts[1] ? `g:${parts[1]}` : null
  }

  return parts.at(-1) ?? null
}

export class ChatgptAdapter extends BaseSiteAdapter {
  canHandle(url: string): boolean {
    const parsedUrl = new URL(url)

    if (!/chatgpt\.com|chat\.openai\.com/.test(parsedUrl.hostname)) {
      return false
    }

    return !isCodexRoute(parsedUrl)
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
    const routeKind = resolveRouteKind(url.pathname)
    return {
      title: doc.title,
      url: url.toString(),
      pathname: url.pathname,
      pageFingerprint: resolvePageFingerprint(url, routeKind),
      domain: url.hostname,
      routeKind,
    }
  }
}
