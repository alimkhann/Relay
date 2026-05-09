import { Suspense } from "react"
import { RELAY_MCP_CLIENT_CATALOG } from "@relay/shared"

import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { DocsFooterNav } from "@/components/docs/docs-footer-nav"

export default function McpDocsPage() {
  return (
    <div className="max-w-2xl space-y-8">
        <PageTelemetry
          surface="web-dashboard"
          area="docs"
          pageName="mcp_docs"
          pageGroup="docs"
          message="Viewed Relay MCP docs."
          secondaryEvent="docs_mcp_viewed"
        />
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
            Run the setup wizard to authenticate, install Relay MCP using local stdio, and auto-install native behavior bridges for supported clients. Relay uses instructions, rules, hooks, or skills only where the target tool has a real standards-based surface.
          </p>
          <pre className="rounded-md bg-[var(--relay-soft)] border border-[var(--relay-line)] px-4 py-3 font-mono text-[13px] text-[var(--relay-ink)]">
            npx @onrelay/wizard
          </pre>
          <p className="text-[13px] text-[var(--relay-muted)]">
            The default install path is local stdio. The wizard focuses on two surfaces only: the browser extension and MCP-connected coding agents.
          </p>
          <p className="text-[13px] text-[var(--relay-muted)]">
            Relay is designed to be used automatically and sparingly: start with <code className="text-[13px] font-mono text-[var(--relay-ink)]">get_brief</code>, use <code className="text-[13px] font-mono text-[var(--relay-ink)]">recall</code> only when local context is incomplete, and use <code className="text-[13px] font-mono text-[var(--relay-ink)]">save</code> for durable writeback and cleanup.
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
              Add the MCP server to your client config. Relay follows each client&apos;s native format instead of forcing one shared JSON schema:
              <pre className="mt-2 rounded-md bg-[var(--relay-soft)] border border-[var(--relay-line)] px-4 py-3 font-mono text-[13px] text-[var(--relay-ink)]">{`{
  "mcpServers": {
    "relay": {
      "command": "npx",
      "args": ["-y", "-p", "@onrelay/mcp", "relay-mcp"]
    }
  }
}`}</pre>
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Compatibility matrix</h2>
          <div className="overflow-x-auto rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--relay-line)]">
                  <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">Client</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">MCP config</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">Transport</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">Instructions</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">Rules</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">Hooks</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">Skills</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">Default install</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--relay-ink)]">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--relay-line)]">
                {RELAY_MCP_CLIENT_CATALOG.map((client) => (
                  <tr key={client.id}>
                    <td className="px-4 py-3 text-[var(--relay-ink)]">
                      <a href={client.officialDocsUrl} className="underline underline-offset-2">
                        {client.name}
                      </a>
                      <div className="mt-1 text-[11px] text-[var(--relay-muted)]">Verified {client.lastVerifiedAt}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--relay-muted)]">{client.mcpConfig}</td>
                    <td className="px-4 py-3 text-[var(--relay-muted)]">{client.supportedTransports.join(", ")}</td>
                    <td className="px-4 py-3 text-[var(--relay-muted)]">{client.instructionSurfaces.join(", ") || "None"}</td>
                    <td className="px-4 py-3 text-[var(--relay-muted)]">{client.ruleSurfaces.join(", ") || "None"}</td>
                    <td className="px-4 py-3 text-[var(--relay-muted)]">
                      {client.hookSurfaces.join(", ") || "None"}
                    </td>
                    <td className="px-4 py-3 text-[var(--relay-muted)]">{client.skillSurfaces.join(", ") || "None"}</td>
                    <td className="px-4 py-3 text-[var(--relay-muted)]">{client.defaultInstallLayers.join(", ") || "mcp"}</td>
                    <td className="px-4 py-3 text-[var(--relay-muted)]">{client.supportTier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-[var(--relay-muted)]">
            `validated` means Relay matches the current official format and has been checked recently. `supported` means Relay follows the published format but the integration surface is still narrower. `experimental` means the client is still installable, but Relay does not yet claim first-class polish.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Available tools</h2>
          <div className="divide-y divide-[var(--relay-line)] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
            {[
              { name: "get_brief", desc: "Load current project context and recent decisions" },
              { name: "recall", desc: "Search memory, inspect state, trace sources, and list continuity data" },
              { name: "save", desc: "Save sessions, checkpoint work, add memory, archive stale memory, and update state" },
              { name: "list_projects", desc: "List all Relay projects" },
              { name: "set_current_project", desc: "Pin the active Relay project for the current MCP session" },
            ].map((tool) => (
              <div key={tool.name} className="px-4 py-3">
                <code className="text-[13px] font-mono font-medium text-[var(--relay-ink)]">{tool.name}</code>
                <p className="mt-0.5 text-[13px] text-[var(--relay-muted)]">{tool.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-[var(--relay-muted)]">
            Relay&apos;s MCP surface is intentionally compact. Legacy split tools are folded into <code className="text-[13px] font-mono text-[var(--relay-ink)]">recall</code> and <code className="text-[13px] font-mono text-[var(--relay-ink)]">save</code>, which keeps tool count and prompt tokens low while preserving explainability and cleanup actions.
          </p>
        </section>

      <Suspense fallback={null}>
        <DocsFooterNav previous={{ href: "/docs/getting-started", label: "Getting Started" }} next={{ href: "/docs/extension", label: "Chrome Extension" }} />
      </Suspense>
    </div>
  )
}
