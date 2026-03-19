import Link from "next/link"

const cards = [
  {
    href: "/docs/getting-started",
    title: "Getting Started",
    desc: "Create an account, set up your first project, and connect your tools.",
  },
  {
    href: "/docs/mcp",
    title: "MCP Integration",
    desc: "Connect Relay to Claude Code, Cursor, Windsurf, and other MCP-compatible tools.",
  },
  {
    href: "/docs/extension",
    title: "Chrome Extension",
    desc: "Install the browser extension to automatically capture context from AI chats.",
  },
  {
    href: "/docs/api",
    title: "API Reference",
    desc: "REST API endpoints for projects, memory, context, and billing.",
  },
  {
    href: "/docs/concepts",
    title: "Concepts",
    desc: "Understand projects, memory items, briefs, work sessions, and truth scoring.",
  },
]

export default function DocsIndexPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--relay-ink)]">Relay Documentation</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          Relay keeps your project context — decisions, tasks, constraints, and notes — synchronized across
          every AI tool you use. Whether you work in ChatGPT, Claude, Cursor, or the terminal, Relay
          makes sure each session starts with full context.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-4 transition hover:border-[var(--relay-accent)]/30 hover:bg-[var(--relay-soft)]"
          >
            <h2 className="text-[14px] font-semibold text-[var(--relay-ink)] group-hover:text-[var(--relay-accent)] transition-colors">
              {card.title}
            </h2>
            <p className="mt-1 text-[13px] text-[var(--relay-muted)]">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
