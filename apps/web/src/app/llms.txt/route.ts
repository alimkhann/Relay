const APP_URL = "https://onrelay.app"

const BODY = `# Relay

> Relay is a browser-first cross-AI memory sidecar. It keeps project context (decisions, constraints, tasks, notes) synchronized across ChatGPT, Claude, Perplexity, Gemini, Grok, and Codex so you don't repeat yourself when switching tools.

Relay runs as a Chrome extension plus a web dashboard. It also exposes an MCP server so CLI agents (Claude Code, Cursor, Codex, etc.) can read and write the same memory.

## Core

- [Homepage](${APP_URL}): product overview, features, pricing
- [Get started](${APP_URL}/get-started): setup flow for extension + CLI wizard
- [Machine page](${APP_URL}/machine): structured, AI-readable description of Relay (what it is, how it works, who it's for)

## Docs

- [Docs index](${APP_URL}/docs): entry point
- [Concepts](${APP_URL}/docs/concepts): memory model, projects, briefs, context packets
- [Extension](${APP_URL}/docs/extension): browser sidecar behavior, supported AI tools
- [MCP](${APP_URL}/docs/mcp): MCP server reference for CLI agents
- [API](${APP_URL}/docs/api): HTTP API reference
- [Plans](${APP_URL}/docs/plans): Free, Starter, Pro pricing + limits

## Optional

- [Privacy](${APP_URL}/privacy)
- [Terms](${APP_URL}/terms)
`

export function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}
