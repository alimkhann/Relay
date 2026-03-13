import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://perplexity.ai/*",
    "https://www.perplexity.ai/*",
    "https://codex.openai.com/*",
    "https://claude.ai/*"
  ],
  run_at: "document_idle"
}

import "../src/content/adapter-runtime"
import "../static/relay-content.js"
