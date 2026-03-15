import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://perplexity.ai/*",
    "https://www.perplexity.ai/*",
    "https://codex.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://aistudio.google.com/*",
    "https://grok.com/*",
    "https://x.com/*",
    "https://chat.deepseek.com/*"
  ],
  run_at: "document_end"
}

import "../src/content/adapter-runtime"
import "../static/relay-content.js"
