import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Docs — Relay",
  description: "Learn how to set up and use Relay to keep project context synced across all your AI tools.",
}

const sections = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/getting-started", label: "Getting Started" },
  { href: "/docs/mcp", label: "MCP Integration" },
  { href: "/docs/extension", label: "Chrome Extension" },
  { href: "/docs/api", label: "API Reference" },
  { href: "/docs/concepts", label: "Concepts" },
]

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--relay-bg)]">
      <div className="mx-auto flex max-w-5xl">
        {/* Sidebar */}
        <nav className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-y-auto border-r border-[var(--relay-line)] py-16 pr-6 pl-4 md:block">
          <Link href="/" className="text-sm font-bold text-[var(--relay-ink)] tracking-tight">
            Relay Docs
          </Link>
          <ul className="mt-6 space-y-1">
            {sections.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="block rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-8 border-t border-[var(--relay-line)] pt-4">
            <Link
              href="/dashboard"
              className="block text-[12px] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
            >
              &larr; Back to dashboard
            </Link>
          </div>
        </nav>

        {/* Content */}
        <main className="min-w-0 flex-1 px-6 py-16 md:px-12">
          {children}
        </main>
      </div>
    </div>
  )
}
