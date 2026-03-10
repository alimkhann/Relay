import type { PlasmoCSConfig } from "plasmo"

import type { RelayMessage } from "../src/messaging/contracts"
import { captureVisibleTurns, getPageState, insertContext } from "../src/content/site-runtime"

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*", "https://chat.openai.com/*", "https://www.perplexity.ai/*", "https://claude.ai/*"]
}

chrome.runtime.onMessage.addListener((message: RelayMessage, _sender: any, sendResponse: (response?: unknown) => void) => {
  void (async () => {
    if (message.type === "RELAY_PAGE_STATE") {
      sendResponse(getPageState())
      return
    }

    if (message.type === "RELAY_CAPTURE_VISIBLE") {
      sendResponse(await captureVisibleTurns(message.payload.projectId))
      return
    }

    if (message.type === "RELAY_INSERT_CONTEXT") {
      sendResponse(await insertContext(message.payload.content))
    }
  })()

  return true
})
