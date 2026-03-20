import { Suspense } from "react"

import { DocsFooterNav } from "@/components/docs/docs-footer-nav"

export default function McpDocsPage() {
  return (
    <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--relay-ink)]">Relay MCP</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
            Relay MCP brings your project context into AI coding tools like Claude Code, Cursor, and Windsurf.
            It syncs memory, decisions, and project state across all your AI conversations.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Quick install</h2>
          <p className="text-[15px] text-[var(--relay-muted)]">
            Run the CLI wizard to authenticate, install MCP config, and set up skill files:
          </p>
          <pre className="rounded-md bg-[var(--relay-soft)] border border-[var(--relay-line)] px-4 py-3 font-mono text-[13px] text-[var(--relay-ink)]">
            npx @onrelay/cli
          </pre>
          <p className="text-[13px] text-[var(--relay-muted)]">
            The wizard will open your browser to authenticate, then configure your IDE automatically.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Manual setup</h2>
          <p className="text-[15px] text-[var(--relay-muted)]">
            If you prefer manual configuration:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-[15px] text-[var(--relay-muted)]">
            <li>
              Create an API token in{" "}
              <a href="/settings" className="text-[var(--relay-accent)] underline underline-offset-2">
                Settings
              </a>
            </li>
            <li>
              Save your token to <code className="text-[13px] font-mono text-[var(--relay-ink)]">~/.relay/mcp.json</code>:
              <pre className="mt-2 rounded-md bg-[var(--relay-soft)] border border-[var(--relay-line)] px-4 py-3 font-mono text-[13px] text-[var(--relay-ink)]">{`{
  "apiBase": "https://onrelay.app",
  "token": "relay_your_token_here"
}`}</pre>
            </li>
            <li>
              Add the MCP server to your IDE config (e.g. <code className="text-[13px] font-mono text-[var(--relay-ink)]">~/.claude/mcp.json</code>):
              <pre className="mt-2 rounded-md bg-[var(--relay-soft)] border border-[var(--relay-line)] px-4 py-3 font-mono text-[13px] text-[var(--relay-ink)]">{`{
  "mcpServers": {
    "relay": {
      "command": "npx",
       "args": ["-y", "@onrelay/mcp"]
    }
  }
}`}</pre>
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Available tools</h2>
          <div className="divide-y divide-[var(--relay-line)] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
            {[
              { name: "get_brief", desc: "Load current project context and recent decisions" },
              { name: "get_project_state", desc: "Get full project state including objectives and constraints" },
              { name: "list_projects", desc: "List all Relay projects" },
              { name: "add_memory", desc: "Save a decision, constraint, or note to project memory" },
              { name: "manage_memory", desc: "Update, archive, or delete a memory item" },
              { name: "search_context", desc: "Search across project context and memory" },
              { name: "save_context", desc: "Save a session summary with decisions and next steps" },
              { name: "update_project", desc: "Rename a project or refresh its description" },
            ].map((tool) => (
              <div key={tool.name} className="px-4 py-3">
                <code className="text-[13px] font-mono font-medium text-[var(--relay-ink)]">{tool.name}</code>
                <p className="mt-0.5 text-[13px] text-[var(--relay-muted)]">{tool.desc}</p>
              </div>
            ))}
          </div>
        </section>

      <Suspense fallback={null}>
        <DocsFooterNav previous={{ href: "/docs/getting-started", label: "Getting Started" }} next={{ href: "/docs/extension", label: "Chrome Extension" }} />
      </Suspense>
    </div>
  )
}
