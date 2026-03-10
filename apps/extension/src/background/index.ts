import type { RelayMessage } from "../messaging/contracts"
import { getRelaySession } from "../storage/session"
import { relayFetch } from "../utils/api"

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)
})

chrome.runtime.onMessage.addListener((message: RelayMessage, sender: any, sendResponse: (response?: unknown) => void) => {
  void (async () => {
    if (message.type === "RELAY_COMPOSE_CONTEXT") {
      const response = await relayFetch(`/api/projects/${message.payload.projectId}/context/compose`, {
        method: "POST",
        body: JSON.stringify({ targetProfileKey: message.payload.targetProfileKey })
      })

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

      sendResponse(await response.json())
      return
    }

    if (message.type === "RELAY_CAPTURE_VISIBLE" && sender.tab?.id) {
      const response = await chrome.tabs.sendMessage(sender.tab.id, message)
      sendResponse(response)
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
  })()

  return true
})
