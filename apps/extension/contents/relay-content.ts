import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://codex.openai.com/*",
    "https://www.perplexity.ai/*",
    "https://claude.ai/*"
  ],
  run_at: "document_idle"
}

import "../static/relay-content.js"
