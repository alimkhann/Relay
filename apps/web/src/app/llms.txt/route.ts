import { APP_ORIGIN } from "@/lib/site-config"

const BODY = `# Relay

> Relay is a browser-first cross-AI memory sidecar. It keeps project context (decisions, constraints, tasks, notes) synchronized across ChatGPT, Claude, Perplexity, Gemini, Grok, and Codex so you don't repeat yourself when switching tools.

Relay runs as a Chrome extension plus a web dashboard. It also exposes an MCP server so CLI agents (Claude Code, Cursor, Codex, etc.) can read and write the same memory.

## Core

- [Homepage](${APP_ORIGIN}): product overview, features, pricing
- [Get started](${APP_ORIGIN}/get-started): setup flow for extension + CLI wizard
- [Machine page](${APP_ORIGIN}/machine): structured, AI-readable description of Relay (what it is, how it works, who it's for)

## Docs

- [Docs index](${APP_ORIGIN}/docs): entry point
- [Concepts](${APP_ORIGIN}/docs/concepts): memory model, projects, briefs, context packets
- [Extension](${APP_ORIGIN}/docs/extension): browser sidecar behavior, supported AI tools
- [MCP](${APP_ORIGIN}/docs/mcp): MCP server reference for CLI agents
- [API](${APP_ORIGIN}/docs/api): HTTP API reference
- [Plans](${APP_ORIGIN}/docs/plans): Free, Starter, Pro pricing + limits

## Optional

- [Privacy](${APP_ORIGIN}/privacy)
- [Terms](${APP_ORIGIN}/terms)
`

export function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}
