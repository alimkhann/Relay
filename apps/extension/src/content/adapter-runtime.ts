import { resolveAdapter } from "@relay/adapters"

import type { PromptTarget, InjectionResult } from "@relay/shared/types/adapter"
import type { PageMetadata, ParsedTurn } from "@relay/shared/types/capture"
import type { SupportedPlatform } from "@relay/shared/types/database"

interface RelayAdapterRuntime {
  resolve(url?: string): { platform: SupportedPlatform } | null
  collectTurns(doc?: Document, url?: string): ParsedTurn[]
  getPageMetadata(doc?: Document, url?: string): PageMetadata | null
  findPrompt(doc?: Document, url?: string): PromptTarget | null
  insertText(text: string, doc?: Document, url?: string): Promise<InjectionResult>
}

declare global {
  interface Window {
    __relayAdapterRuntime?: RelayAdapterRuntime
  }
}

function getAdapter(url = window.location.href) {
  return resolveAdapter(url)
}

export function installRelayAdapterRuntime() {
  window.__relayAdapterRuntime = {
    resolve(url = window.location.href) {
      const adapter = getAdapter(url)
      return adapter ? { platform: adapter.getPlatform() } : null
    },
    collectTurns(doc = document, url = window.location.href) {
      const adapter = getAdapter(url)
      return adapter?.extractVisibleTurns(doc) ?? []
    },
    getPageMetadata(doc = document, url = window.location.href) {
      const adapter = getAdapter(url)
      return adapter?.getPageMetadata(doc) ?? null
    },
    findPrompt(doc = document, url = window.location.href) {
      const adapter = getAdapter(url)
      return adapter?.findPromptInput(doc) ?? null
    },
    async insertText(text: string, doc = document, url = window.location.href) {
      const adapter = getAdapter(url)
      return adapter ? adapter.insertTextIntoPrompt(text, doc) : { ok: false, reason: "Unsupported site." }
    }
  }
}

installRelayAdapterRuntime()
