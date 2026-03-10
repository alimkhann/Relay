import { resolveAdapter } from "@relay/adapters"

import type { RelayPageState } from "../messaging/contracts"
import { relayFetch } from "../utils/api"

async function readErrorResponse(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string }
    return payload.error ?? payload.message ?? fallback
  } catch {
    return fallback
  }
}

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

  const response = await relayFetch("/api/captures", {
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

  if (!response.ok) {
    return {
      ok: false,
      reason: await readErrorResponse(response, "Capture request failed.")
    }
  }

  const result = (await response.json()) as { turns?: Array<unknown> }

  return {
    ok: true,
    turns: result.turns?.length ?? turns.length
  }
}

export async function insertContext(content: string) {
  const adapter = resolveAdapter(window.location.href)
  if (!adapter) return { ok: false, reason: "Unsupported site" }

  return adapter.insertTextIntoPrompt(content, document)
}
