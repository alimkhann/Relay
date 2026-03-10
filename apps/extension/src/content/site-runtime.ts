import { resolveAdapter } from "@relay/adapters"

import type { RelayPageState } from "../messaging/contracts"
import { relayFetch } from "../utils/api"

export function getPageState(): RelayPageState {
  const adapter = resolveAdapter(window.location.href)

  if (!adapter) {
    return { supported: false }
  }

  const turns = adapter.extractVisibleTurns(document)
  const metadata = adapter.getPageMetadata(document)

  return {
    supported: true,
    platform: adapter.getPlatform(),
    title: metadata.title,
    url: metadata.url,
    turns: turns.length
  }
}

export async function captureVisibleTurns(projectId: string) {
  const adapter = resolveAdapter(window.location.href)
  if (!adapter) return { ok: false, reason: "Unsupported site" }

  const turns = adapter.extractVisibleTurns(document)
  const metadata = adapter.getPageMetadata(document)

  await relayFetch("/api/captures", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      platform: adapter.getPlatform(),
      session: {
        title: metadata.title,
        url: metadata.url,
        pageFingerprint: metadata.pageFingerprint,
        metadata: {
          domain: metadata.domain,
          pathname: metadata.pathname
        }
      },
      turns
    })
  })

  return { ok: true, turns: turns.length }
}

export async function insertContext(content: string) {
  const adapter = resolveAdapter(window.location.href)
  if (!adapter) return { ok: false, reason: "Unsupported site" }

  return adapter.insertTextIntoPrompt(content, document)
}
