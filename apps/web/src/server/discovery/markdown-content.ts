import { APP_ORIGIN } from "@/lib/site-config"

function join(sections: string[]) {
  return `${sections.join("\n\n").trim()}\n`
}

function buildDocsIndexMarkdown() {
  return join([
    "# Relay Documentation",
    "Relay keeps project context such as decisions, tasks, constraints, and notes synchronized across AI tools and coding agents.",
    "## Guides",
    `- [Getting Started](${APP_ORIGIN}/docs/getting-started)`,
    `- [MCP Integration](${APP_ORIGIN}/docs/mcp)`,
    `- [Chrome Extension](${APP_ORIGIN}/docs/extension)`,
    `- [Plans & Limits](${APP_ORIGIN}/docs/plans)`,
    `- [API Reference](${APP_ORIGIN}/docs/api)`,
    `- [Concepts](${APP_ORIGIN}/docs/concepts)`,
  ])
}

function buildApiMarkdown() {
  return join([
    "# Relay API Reference",
    "Relay exposes a REST API for programmatic access. Endpoints use a web session or Bearer token for authentication.",
    "## Authentication",
    "For API and MCP access, create a token in Relay settings and send it as a Bearer token.",
    "```http\nAuthorization: Bearer relay_your_token_here\n```",
    "## Rate limits",
    "Rate limits vary by plan. Current API responses return rate-limit headers when applicable.",
    "## Projects",
    "- `GET /api/projects` List all projects for the authenticated user",
    "- `POST /api/projects` Create a new project",
    "- `GET /api/projects/:id` Get project details",
    "- `PATCH /api/projects/:id` Update project name or description",
    "- `DELETE /api/projects/:id` Archive a project",
    "## Memory",
    "- `GET /api/projects/:id/memory` List memory items for a project",
    "- `POST /api/projects/:id/memory` Add a memory item",
    "- `PATCH /api/memory/:id` Update a memory item",
    "- `DELETE /api/memory/:id` Delete a memory item",
    "- `POST /api/projects/:id/memory/batch` Batch write memory items",
    "- `GET /api/projects/:id/memory/search` Search memory items",
    "## Context and Briefs",
    "- `POST /api/projects/:id/context/compose` Generate a context brief for a target profile",
    "- `GET /api/projects/:id/context/history` List generated context packets",
    "- `POST /api/projects/:id/bootstrap` Generate a bootstrap brief",
    "- `GET /api/projects/:id/bootstrap/latest` Get the latest cached bootstrap brief",
    "- `POST /api/projects/:id/handoff` Generate a fresh-chat export",
    "## Work Sessions",
    "- `POST /api/projects/:id/work-sessions/open` Open a new work session",
    "- `POST /api/projects/:id/work-sessions/checkpoint` Save a checkpoint",
    "- `POST /api/projects/:id/work-sessions/close` Close the active session",
    "## Auth and MCP",
    "- `POST /api/extension/tokens` Create an API token for MCP or extension access",
    "- `DELETE /api/extension/tokens/:id` Revoke an API token",
    "- `POST /api/mcp/token` Start MCP authorization",
    "- `PATCH /api/mcp/token` Approve MCP authorization",
    "- `POST /api/mcp/token/poll` Poll MCP authorization state",
    "- `POST /api/mcp/refresh` Refresh an MCP access token",
    "- `POST /api/mcp/revoke` Revoke an MCP access token",
  ])
}

function buildConceptsMarkdown() {
  return join([
    "# Relay Concepts",
    "Relay organizes and scores project context across browser chats and coding agents.",
    "## Projects",
    "A project is the top-level container for memory, packets, work sessions, and stable context.",
    "## Project Context",
    "Relay stores current truth as objectives, decisions, constraints, tasks, progress, architecture facts, risks, and assumptions.",
    "Entries can be active, tentative, disputed, superseded, stale, or resolved.",
    "## Observe → Reflect → Promote",
    "Relay turns raw session observations into durable context through an observe, reflect, and promote cycle.",
    "## Current vs historical truth",
    "Context entries can carry validity windows so Relay can answer both current-state and historical questions.",
    "## Memory and compaction",
    "Raw memory is retained for provenance, but may be demoted when covered by context or summaries.",
    "## Packet types",
    "- Fresh chat bootstrap",
    "- Quick continuity",
    "- Agent full bootstrap",
    "- Agent quick continuity",
    "## Drift reconciliation",
    "Relay detects conflicting claims from different surfaces and flags them for review.",
  ])
}

function buildExtensionMarkdown() {
  return join([
    "# Relay Chrome Extension",
    "The Relay Chrome extension captures decisions, tasks, constraints, and context from supported AI chat tools.",
    "## Supported platforms",
    "- ChatGPT (`chatgpt.com`)",
    "- Claude (`claude.ai`)",
    "- Gemini (`gemini.google.com`)",
    "- Perplexity (`perplexity.ai`)",
    "- Grok (`grok.x.ai`)",
    "- DeepSeek (`chat.deepseek.com`)",
    "- Codex (`chatgpt.com/codex`)",
    "## Installation",
    "1. Install the extension from the Chrome Web Store.",
    "2. Open the Relay side panel.",
    "3. Sign in with the same account you use on Relay.",
    "4. Choose a project and decide whether to enable auto-capture.",
    "## Settings",
    "- Auto-capture",
    "- Platform-specific capture toggles",
    "- Inline brief-insert chip",
  ])
}

function buildGettingStartedMarkdown() {
  return join([
    "# Relay Getting Started",
    "Get up and running with Relay in under five minutes.",
    "1. Create an account at [Relay Get Started](" + `${APP_ORIGIN}/get-started` + ").",
    "2. Create your first project.",
    "3. Install the Chrome extension and sign in within the sidebar.",
    "4. Optionally connect Relay MCP by running `npx @onrelay/wizard`.",
    "5. Start using supported AI tools with Relay context capture enabled.",
    "## Next guides",
    `- [Chrome Extension](${APP_ORIGIN}/docs/extension)`,
    `- [MCP Integration](${APP_ORIGIN}/docs/mcp)`,
    `- [Concepts](${APP_ORIGIN}/docs/concepts)`,
    `- [Plans & Limits](${APP_ORIGIN}/docs/plans)`,
  ])
}

function buildMcpMarkdown() {
  return join([
    "# Relay MCP",
    "Relay MCP brings project context into tools like Claude Code, Cursor, Windsurf, and Codex.",
    "## Quick install",
    "```bash\nnpx @onrelay/wizard\n```",
    "The wizard opens a browser sign-in flow and configures your IDE automatically.",
    "## Manual setup",
    "1. Create an API token in Relay settings.",
    "2. Save the token in your local Relay MCP config.",
    "3. Add the Relay MCP server to your IDE config.",
    "## Available tools",
    "- `list_projects`",
    "- `set_current_project`",
    "- `get_brief`",
    "- `get_project_state`",
    "- `search_context`",
    "- `add_memory`",
    "- `manage_memory`",
    "- `recall_context`",
    "- `save_context`",
    "- `checkpoint_context`",
    "- `set_project_state`",
    "- `update_project`",
  ])
}

function buildPlansMarkdown() {
  return join([
    "# Relay Plans & Limits",
    "Three tiers: Free to explore, Starter for daily use, Pro for full autonomy.",
    "## Included on every plan",
    "- Browser capture across supported AI tools",
    "- Project context and continuity briefs",
    "- Chrome extension and MCP access",
    "## Key limits",
    "| Limit | Free | Starter | Pro |",
    "| --- | --- | --- | --- |",
    "| Active projects | 2 | 10 | 20 |",
    "| Captures / month | 100 | 1,200 | 3,000 |",
    "| Retention | 7 days | 180 days | 365 days |",
    "| MCP basic reads / day | 12 | 200 | 500 |",
    "| MCP deep reads / day | 2 | 12 | 30 |",
    "| MCP writes / day | 1 | 15 | 40 |",
    "| Memory items / project | 150 | 1,500 | 4,000 |",
  ])
}

function buildHomeMarkdown() {
  return join([
    "# Relay",
    "Relay is a browser-first cross-AI memory sidecar for developers. It captures decisions, tasks, and constraints from AI chats and keeps a living project brief synced across browser tools and MCP-connected coding agents.",
    "## What it does",
    "- Captures context from supported AI chats",
    "- Builds living project briefs",
    "- Injects context into fresh chats",
    "- Syncs context between browser sessions and IDE agents",
    "## Key links",
    `- [Get Started](${APP_ORIGIN}/get-started)`,
    `- [Docs](${APP_ORIGIN}/docs)`,
    `- [MCP](${APP_ORIGIN}/docs/mcp)`,
    `- [API](${APP_ORIGIN}/docs/api)`,
    `- [Machine page](${APP_ORIGIN}/machine)`,
  ])
}

function buildMachineMarkdown() {
  return join([
    "# Relay: Cross-AI Context Management",
    "Relay is a Chrome extension and MCP server that captures durable context from AI conversations and keeps a living project brief synchronized across tools.",
    "## Supported browser tools",
    "ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek",
    "## Supported IDE agents",
    "Claude Code, Cursor, Codex, Windsurf, OpenCode, Gemini CLI, VS Code, Continue, Aider, Cline, Roo Code, and other MCP-compatible agents",
    "## MCP quick start",
    "```bash\nnpx @onrelay/wizard\n```",
  ])
}

function buildAgentGetStartedMarkdown() {
  return join([
    "# Relay Get Started",
    "The browser version of this path redirects into the correct sign-in or dashboard flow.",
    "For agents, use the following onboarding sequence instead:",
    "1. Open [Relay sign-up](" + `${APP_ORIGIN}/get-started` + ") in a browser if a human needs to authenticate.",
    "2. Create the first project after sign-in.",
    "3. Install the Chrome extension if browser capture is needed.",
    "4. Run `npx @onrelay/wizard` if MCP access is needed.",
    `See [Getting Started docs](${APP_ORIGIN}/docs/getting-started) for the full setup guide.`,
  ])
}

function buildPrivacyMarkdown() {
  return join([
    "# Relay Privacy Policy",
    "Last updated: April 2, 2026",
    "Relay collects account data, captured AI chat content when capture is enabled, derived summaries and decisions, project metadata, extension state, and product analytics needed to operate the service.",
    "Relay uses this data to maintain project canon and context packets, render the dashboard, authenticate users, and improve service reliability.",
    "Relay states that it does not sell personal data or chat content for advertising or marketing purposes.",
    `Read the full policy at [${APP_ORIGIN}/privacy](${APP_ORIGIN}/privacy).`,
  ])
}

function buildTermsMarkdown() {
  return join([
    "# Relay Terms of Service",
    "Last updated: April 2, 2026",
    "Relay is a productivity service for capturing context from AI chat sessions and maintaining project canon across the web app, Chrome extension, and MCP integrations.",
    "Users are responsible for lawful use, account security, and avoiding sensitive data in captured chats.",
    "Relay retains user ownership over captured content while reserving rights over the service software and branding.",
    `Read the full terms at [${APP_ORIGIN}/terms](${APP_ORIGIN}/terms).`,
  ])
}

export const PUBLIC_MARKDOWN_PAGES: Record<string, string> = {
  "/": buildHomeMarkdown(),
  "/machine": buildMachineMarkdown(),
  "/docs": buildDocsIndexMarkdown(),
  "/docs/api": buildApiMarkdown(),
  "/docs/concepts": buildConceptsMarkdown(),
  "/docs/extension": buildExtensionMarkdown(),
  "/docs/getting-started": buildGettingStartedMarkdown(),
  "/docs/mcp": buildMcpMarkdown(),
  "/docs/plans": buildPlansMarkdown(),
  "/get-started": buildAgentGetStartedMarkdown(),
  "/privacy": buildPrivacyMarkdown(),
  "/terms": buildTermsMarkdown(),
}

export function getPublicMarkdown(pathname: string) {
  return PUBLIC_MARKDOWN_PAGES[pathname] ?? null
}

export function estimateMarkdownTokens(markdown: string) {
  return Math.max(1, Math.ceil(markdown.length / 4))
}
