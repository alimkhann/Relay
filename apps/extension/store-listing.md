# Relay — Chrome Web Store Listing

## Short Description (132 chars max)

Keep project memory moving between ChatGPT, Claude, Gemini, Grok, Perplexity, and DeepSeek.

## Detailed Description

Every time you switch between AI tools, you start from scratch. You re-explain your project, repeat past decisions, and lose the thread of what you were doing. If you use ChatGPT, Claude, Gemini, Grok, Perplexity, or DeepSeek throughout your day, you know the pain of copy-pasting context between them.

Relay fixes this. It watches your AI conversations and automatically captures key decisions, tasks, and context into a living project brief. When you open a new chat in any supported AI tool, Relay provides your full project context so the AI already knows what you're working on, what you've decided, and what's next. No more re-explaining. No more lost context.

How it works: Relay adds a side panel to your browser that shows your project brief alongside any AI chat. Context is captured automatically as you work — no manual notes needed. You can organize work into projects, and Relay keeps each brief up to date as your conversations evolve. For developers, Relay also integrates with IDE agents like Claude Code, Cursor, and Windsurf via MCP, so your coding assistant has the same context as your browser-based AI tools. Built for developers, indie builders, and AI power users who rely on multiple AI tools every day.

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

## Host Permission Justifications (for CWS reviewer)

| Domain | Reason |
|---|---|
| chatgpt.com, chat.openai.com | ChatGPT chat capture |
| claude.ai | Claude chat capture |
| gemini.google.com, aistudio.google.com | Gemini/AI Studio chat capture |
| grok.com, x.com | Grok chat capture (Grok chat runs on both grok.com and x.com/i/grok) |
| perplexity.ai, www.perplexity.ai | Perplexity chat capture |
| chat.deepseek.com | DeepSeek chat capture |
| codex.openai.com | Codex chat capture |
| onrelay.app, www.onrelay.app, t.onrelay.app | Relay API backend for authentication, data sync, and telemetry proxy |
