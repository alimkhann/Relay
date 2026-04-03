# Relay — Chrome Web Store Listing

## Short Description (132 chars max)

Stop repeating yourself to every AI. Relay keeps your project context synced across all your AI chats and IDE agents.

## Detailed Description

Every time you switch between AI tools, you start from scratch. You re-explain your project, repeat past decisions, and lose the thread of what you were doing.

Relay fixes this. It adds a side panel to supported AI chat sites, captures project context while the extension is connected and capture is enabled, and keeps a living project brief ready for the next session. When you open a fresh chat, Relay restores the latest brief so the AI already knows what you're working on, what you've decided, and what is next.

How it works: Relay shows your project brief alongside supported AI chats, groups work into projects, and keeps that brief updated as your sessions evolve. For developers, Relay also works with MCP-connected IDE agents so your coding agent can read and write the same project memory as your browser sessions.

Supported AI chat sites: ChatGPT, Claude, Gemini, Grok, and Perplexity. Built for developers, indie builders, and AI power users who rely on multiple AI tools every day.

## Category

Productivity

## Permission Justifications (for CWS reviewer)

| Permission | Justification |
|---|---|
| `storage` | Persist auth tokens, user preferences, and cached project state locally |
| `tabs` | Detect which AI chat tool the user has open to activate the correct adapter |
| `activeTab` | Read chat content from the active tab on supported AI platforms only |
| `sidePanel` | Primary UI — project context panel shown alongside AI chats |
| `identity` | Chrome Identity API for Google sign-in authentication |
| `scripting` | Inject content scripts to observe DOM changes on supported AI sites |
| `offscreen` | Run a minimal offscreen document for theme detection because service workers cannot use `matchMedia` |

## Host Permission Justifications (for CWS reviewer)

| Domain | Reason |
|---|---|
| chatgpt.com, chat.openai.com | ChatGPT chat capture |
| claude.ai | Claude chat capture |
| gemini.google.com, aistudio.google.com | Gemini/AI Studio chat capture |
| grok.com, x.com/i/grok | Grok chat capture |
| perplexity.ai, www.perplexity.ai | Perplexity chat capture |
| chat.deepseek.com | DeepSeek chat capture |
| codex.openai.com | Codex chat capture |
| onrelay.app, www.onrelay.app, t.onrelay.app | Relay web/API domains used for authentication, pairing, and data sync |
| eu.i.posthog.com | PostHog endpoint used for product analytics and error tracking |
