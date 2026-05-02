import { Suspense } from "react"

import { DocsFooterNav } from "@/components/docs/docs-footer-nav"

export default function ApiDocsPage() {
  const endpoints = [
    {
      group: "Projects",
      routes: [
        { method: "GET", path: "/api/projects", desc: "List all projects for the authenticated user" },
        { method: "POST", path: "/api/projects", desc: "Create a new project" },
        { method: "GET", path: "/api/projects/:id", desc: "Get project details" },
        { method: "PATCH", path: "/api/projects/:id", desc: "Update project name/description" },
        { method: "DELETE", path: "/api/projects/:id", desc: "Archive a project" },
      ],
    },
    {
      group: "Memory",
      routes: [
        { method: "GET", path: "/api/projects/:id/memory", desc: "List memory items for a project" },
        { method: "POST", path: "/api/projects/:id/memory", desc: "Add a memory item (decision, note, task, etc.)" },
        { method: "PATCH", path: "/api/projects/:id/memory/:memoryId", desc: "Update a memory item" },
        { method: "DELETE", path: "/api/projects/:id/memory/:memoryId", desc: "Delete a memory item" },
        { method: "POST", path: "/api/projects/:id/memory/batch", desc: "Batch add/update memory items" },
        { method: "POST", path: "/api/projects/:id/memory/search", desc: "Search project memory" },
      ],
    },
    {
      group: "Context & Briefs",
      routes: [
        { method: "POST", path: "/api/projects/:id/context/compose", desc: "Generate a context brief for a target profile" },
        { method: "GET", path: "/api/projects/:id/context/history", desc: "List generated context packets" },
        { method: "POST", path: "/api/projects/:id/bootstrap", desc: "Generate a full bootstrap brief" },
        { method: "GET", path: "/api/projects/:id/bootstrap/latest", desc: "Get the latest cached bootstrap brief" },
        { method: "POST", path: "/api/projects/:id/handoff", desc: "Generate a fresh-chat brief export (Pro only)" },
      ],
    },
    {
      group: "Work Sessions",
      routes: [
        { method: "POST", path: "/api/projects/:id/work-sessions/open", desc: "Open a new work session" },
        { method: "POST", path: "/api/projects/:id/work-sessions/checkpoint", desc: "Save a checkpoint to the active session" },
        { method: "POST", path: "/api/projects/:id/work-sessions/close", desc: "Close the active work session" },
      ],
    },
    {
      group: "Auth",
      routes: [
        { method: "POST", path: "/api/extension/tokens", desc: "Create an API token for MCP/extension" },
        { method: "DELETE", path: "/api/extension/tokens/:id", desc: "Revoke an API token" },
      ],
    },
  ]

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--relay-ink)]">API Reference</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          Relay exposes a REST API for programmatic access. All endpoints require authentication
          via a session cookie (web) or Bearer token (MCP).
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Authentication</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          For API/MCP access, create a token in{" "}
          <a href="/settings" className="text-[var(--relay-accent)] underline underline-offset-2">
            Settings
          </a>{" "}
          and pass it as a Bearer token:
        </p>
        <pre className="rounded-md bg-[var(--relay-soft)] border border-[var(--relay-line)] px-4 py-3 font-mono text-[13px] text-[var(--relay-ink)]">
          Authorization: Bearer relay_your_token_here
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">Rate limits</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          API rate limits depend on your plan. The Free plan allows 20 MCP reads and 5 MCP writes
          per day. Pro allows 200 reads and 50 writes per day. Rate limit info is returned in response headers.
        </p>
      </section>

      {endpoints.map((group) => (
        <section key={group.group} className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--relay-ink)] border-b border-[var(--relay-line)] pb-2 mb-4">{group.group}</h2>
          <div className="divide-y divide-[var(--relay-line)] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
            {group.routes.map((route) => (
              <div key={`${route.method}-${route.path}`} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-14 text-center rounded text-[11px] font-bold uppercase tracking-wide py-0.5 ${
                      route.method === "GET"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : route.method === "POST"
                          ? "bg-blue-500/10 text-blue-500"
                          : route.method === "PATCH"
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {route.method}
                  </span>
                  <code className="text-[13px] font-mono text-[var(--relay-ink)]">{route.path}</code>
                </div>
                <p className="mt-1 text-[13px] text-[var(--relay-muted)] pl-16">{route.desc}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <Suspense fallback={null}>
        <DocsFooterNav previous={{ href: "/docs/plans", label: "Plans & limits" }} next={{ href: "/docs/concepts", label: "Concepts" }} />
      </Suspense>
    </div>
  )
}
