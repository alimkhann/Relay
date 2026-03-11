import type { RelayMessage } from "../messaging/contracts"
import { getRelaySession } from "../storage/session"
import { relayFetch } from "../utils/api"

async function readErrorResponse(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string }
    return payload.error ?? payload.message ?? fallback
  } catch {
    return fallback
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)
})

chrome.runtime.onMessage.addListener((message: RelayMessage, sender: any, sendResponse: (response?: unknown) => void) => {
  void (async () => {
    try {
      if (message.type === "RELAY_COMPOSE_CONTEXT") {
        const response = await relayFetch(`/api/projects/${message.payload.projectId}/context/compose`, {
          method: "POST",
          body: JSON.stringify({ targetProfileKey: message.payload.targetProfileKey })
        })

        if (!response.ok) {
          sendResponse({ error: await readErrorResponse(response, "Context composition failed.") })
          return
        }

        sendResponse(await response.json())
        return
      }

      if (message.type === "RELAY_BIND_PROJECT") {
        const response = await relayFetch("/api/extension/bindings", {
          method: "POST",
          body: JSON.stringify({
            projectId: message.payload.projectId,
            bindingKind: message.payload.tabId ? "tab" : "domain",
            tabId: message.payload.tabId ?? null,
            domain: message.payload.domain ?? null
          })
        })

        if (!response.ok) {
          sendResponse({ error: await readErrorResponse(response, "Binding failed.") })
          return
        }

        sendResponse(await response.json())
        return
      }

      if (message.type === "RELAY_CAPTURE_VISIBLE") {
        const tabId = message.payload.tabId ?? sender.tab?.id

        if (!tabId) {
          sendResponse({ ok: false, reason: "No supported tab was provided for capture." })
          return
        }

        const result = await chrome.tabs.sendMessage(tabId, message)

        if (!result?.ok || !result.capture) {
          sendResponse(result ?? { ok: false, reason: "Capture failed." })
          return
        }

        const response = await relayFetch("/api/captures", {
          method: "POST",
          body: JSON.stringify({
            projectId: message.payload.projectId,
            ...result.capture
          })
        })

        if (!response.ok) {
          sendResponse({
            ok: false,
            reason: await readErrorResponse(response, "Capture request failed.")
          })
          return
        }

        const payload = await response.json()

        sendResponse({
          ok: true,
          turns: payload.turns?.length ?? result.capture.turns?.length ?? 0
        })
        return
      }

      if (message.type === "RELAY_PAGE_STATE" && sender.tab?.id) {
        const response = await chrome.tabs.sendMessage(sender.tab.id, message)
        sendResponse(response)
        return
      }

      if (message.type === "RELAY_INSERT_CONTEXT" && sender.tab?.id) {
        const response = await chrome.tabs.sendMessage(sender.tab.id, message)
        sendResponse(response)
        return
      }

      const session = await getRelaySession()
      sendResponse(session)
    } catch (cause) {
      sendResponse({
        error: cause instanceof Error ? cause.message : "Relay request failed."
      })
    }
  })()

  return true
})
