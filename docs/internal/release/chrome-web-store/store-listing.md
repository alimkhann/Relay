# Relay — Chrome Web Store Listing

## Short Description (132 chars max)

Keep project context ready across ChatGPT, Claude, Gemini, Perplexity, Grok, and your IDE agents without repeating yourself.

## Detailed Description

Every time you switch between AI tools, you lose context. You repeat your project goals, re-explain past decisions, and waste turns getting the model back on track.

Relay fixes that. It adds a side panel to supported AI chats, saves meaningful chats into projects, and keeps the same project memory available across the browser and MCP-connected coding agents.

How Relay works today:

- Capture and organize AI chats into projects from the side panel
- Keep project context ready beside supported AI chats
- Insert the latest project brief into a fresh chat with one click from the inline chip or side panel
- Save notes from anywhere on the web by highlighting text and using Save to Relay
- Review pinned decisions, tasks, constraints, and notes inside the extension
- Sync the same project memory with MCP-connected IDE agents

Supported AI chat sites: ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek, and Codex.

Built for developers, indie builders, and AI power users who work across multiple AI tools every day.

## What’s New in 0.5.1

- Ask Relay directly from the extension side panel, including optional voice input and file attachments
- Save selected webpage text into the active Relay project
- Keep unsupported and idle tabs local so the extension makes substantially fewer background requests
- Refresh project, authentication, billing, and capture state immediately after user actions

## Category

Productivity

## Permission Justifications (for CWS reviewer)

| Permission | Justification |
|---|---|
| `storage` | Store auth state, user preferences, cached project state, and capture dedupe state locally |
| `tabs` | Detect the active supported AI tab and keep side panel state in sync with it |
| `activeTab` | Read chat content only from the currently active supported AI page |
| `sidePanel` | Primary Relay UI shown alongside supported AI chats |
| `identity` | Chrome Identity API for Google sign-in |
| `scripting` | Inject content scripts on supported AI sites to read chats and insert project briefs |
| `contextMenus` | Save highlighted text from any webpage into Relay via right-click |

## Host Permission Justifications (for CWS reviewer)

| Domain | Reason |
|---|---|
| chatgpt.com, chat.openai.com | ChatGPT chat capture and brief insertion |
| claude.ai | Claude chat capture and brief insertion |
| gemini.google.com, aistudio.google.com | Gemini / AI Studio chat capture and brief insertion |
| grok.com | Grok chat capture and brief insertion |
| perplexity.ai, www.perplexity.ai | Perplexity chat capture and brief insertion |
| chat.deepseek.com | DeepSeek chat capture and brief insertion |
| codex.openai.com | Codex chat capture and brief insertion |
| onrelay.app, www.onrelay.app, t.onrelay.app | Relay authentication, API sync, and billing flows |
