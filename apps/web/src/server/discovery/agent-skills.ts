import { createHash } from "node:crypto"

export interface AgentSkillDocument {
  slug: string
  name: string
  description: string
  content: string
}

const FRONTMATTER = `license: Proprietary
compatibility: Works with Relay's hosted web app and MCP server.
metadata:
  author: Relay
  version: "1.0"
`

function buildSkillDocument(input: {
  name: string
  description: string
  slug: string
  body: string
}) {
  const content = `---
name: ${input.name}
description: ${input.description}
${FRONTMATTER}---

${input.body.trim()}
`

  return {
    slug: input.slug,
    name: input.slug,
    description: input.description,
    content,
  } satisfies AgentSkillDocument
}

export const AGENT_SKILL_DOCUMENTS = [
  buildSkillDocument({
    slug: "install-relay-mcp",
    name: "Install Relay MCP",
    description: "Authenticate Relay and connect its MCP server to Claude Code, Cursor, Codex, and other compatible tools.",
    body: `
# Install Relay MCP

Use this skill when the user wants to connect Relay to an MCP-compatible coding tool so the agent can read and write project context.

## What Relay MCP provides

- Lists the user's Relay projects
- Loads a current project brief for coding sessions
- Searches or writes project memory
- Saves structured session context back to Relay

## Recommended flow

1. Tell the user to run:

\`\`\`bash
npx @onrelay/wizard
\`\`\`

2. Explain that the wizard opens a browser sign-in flow, authenticates the user, and installs the MCP configuration automatically.
3. If the user prefers manual setup, point them to [Relay MCP docs](https://www.onrelay.app/docs/mcp).

## Important notes

- Relay's hosted streamable HTTP MCP endpoint is \`https://www.onrelay.app/api/mcp/stream\`.
- The safest default is the setup wizard, not manual token editing.
- Once connected, start sessions by calling \`list_projects\` and then \`get_brief\`.
`,
  }),
  buildSkillDocument({
    slug: "fetch-project-brief",
    name: "Fetch Relay Project Brief",
    description: "Load the correct Relay project brief at the start of a coding session.",
    body: `
# Fetch Relay Project Brief

Use this skill when a coding agent needs the current Relay context before making changes.

## Workflow

1. Call \`list_projects\`.
2. Match the current repository or working directory to the most likely Relay project.
3. If needed, call \`set_current_project\` with the matching project ID.
4. Call \`get_brief\` to load the current project brief.

## Guidance

- Prefer \`get_brief\` for human-readable working context.
- Use \`get_project_state\` when the task needs structured state.
- Use \`search_context\` or \`recall_context\` before making architectural changes.

## When to refresh

- At the beginning of a new coding session
- After switching repositories or projects
- Before making decisions that may conflict with existing constraints
`,
  }),
  buildSkillDocument({
    slug: "save-session-context",
    name: "Save Relay Session Context",
    description: "Persist decisions, progress, constraints, and next steps back into Relay at the end of a session.",
    body: `
# Save Relay Session Context

Use this skill when a coding session produced new durable context that should be preserved in Relay.

## Preferred write pattern

- Use \`add_memory\` immediately for important individual decisions, constraints, or tasks.
- Use \`checkpoint_context\` for a mid-session snapshot that should not close the work session.
- Use \`save_context\` when you want to finalize the session summary.

## Minimum end-of-session payload

- A short summary of what changed
- New decisions
- New constraints
- Next steps
- Touched files when they materially affect future work

## Example

\`\`\`json
{
  "summary": "Wired markdown negotiation and discovery endpoints for agent readiness.",
  "decisions": ["Use middleware rewrite for markdown negotiation on public pages."],
  "nextSteps": ["Deploy and smoke-test well-known endpoints on production."],
  "touchedFiles": ["apps/web/src/middleware.ts", "apps/web/src/app/openapi.json/route.ts"]
}
\`\`\`
`,
  }),
] as const

export function getAgentSkillDocument(slug: string) {
  return AGENT_SKILL_DOCUMENTS.find((skill) => skill.slug === slug) ?? null
}

export function getAgentSkillDigest(content: string) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`
}
