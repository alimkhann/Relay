# Relay — Chrome Web Store Reviewer Notes

## What the extension does

Relay adds a side panel to supported AI chat websites and helps users keep project context synchronized across browser chats and MCP-connected coding agents.

Supported browser chat surfaces in the current build:

- ChatGPT (`chatgpt.com`, `chat.openai.com`)
- Claude (`claude.ai`)
- Gemini and AI Studio (`gemini.google.com`, `aistudio.google.com`)
- Perplexity (`perplexity.ai`, `www.perplexity.ai`)
- Grok (`grok.com`)
- DeepSeek (`chat.deepseek.com`)
- Codex (`codex.openai.com`)

## How capture works

- Relay only reads content on the supported domains listed above.
- Relay captures chat context for the signed-in user while the extension is connected and capture is enabled.
- Captured chat content can include the visible message text plus associated raw HTML markup from the supported chat interface so Relay can preserve structure and parse conversations more reliably.
- Captured data is sent to the user's Relay account to generate and update project briefs.
- The extension does not inject or execute remote code. All executable code is bundled with the extension package.

## Why each permission is needed

- `storage`: persist sign-in state, user preferences, project selection, and cached project state.
- `tabs`: detect which supported AI tab is active and route the side panel correctly.
- `activeTab`: read the current supported chat tab when the user is working in it.
- `sidePanel`: display Relay's project context UI next to supported AI chats.
- `identity`: use Chrome Identity for Google sign-in.
- `scripting`: inject the bundled content script into supported AI sites.
- `contextMenus`: let the user explicitly save selected text from a webpage into Relay.
- Optional `audioCapture`: access microphone audio only after the user starts Ask Relay voice input.

## Host permissions

Host permissions are restricted to supported AI chat domains, Relay's own web/API domains used for authentication and sync, and the PostHog endpoint (`eu.i.posthog.com`) used for analytics and error tracking.

## Data handling summary

- Account data: email, name, avatar from Google sign-in.
- Extension data: local auth/session state, selected project, preferences, onboarding state.
- Captured content: supported AI chat text, associated raw HTML markup from the chat interface, and related project context for the signed-in user.
- Ask Relay content: messages, selected text, and files the user explicitly submits; optional microphone audio is accessed only when the user starts voice input.
- Relay uses PostHog for product analytics and error tracking, and the extension may send telemetry directly to PostHog in addition to Relay-owned domains used for authentication and sync.
- Relay's backend uses Google Gemini for AI processing, Neon for database/authentication, Vercel for hosting, Cloudflare R2 for encrypted uploaded files, Polar for subscriptions, and Resend for transactional email. The privacy policy explicitly lists the data shared with each provider.

Public policy URLs:

- Privacy: `https://onrelay.app/privacy`
- Terms: `https://onrelay.app/terms`
