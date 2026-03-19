"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/cn"

const sections = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/getting-started", label: "Getting Started" },
  { href: "/docs/mcp", label: "MCP Integration" },
  { href: "/docs/extension", label: "Chrome Extension" },
  { href: "/docs/plans", label: "Plans & limits" },
  { href: "/docs/api", label: "API Reference" },
  { href: "/docs/concepts", label: "Concepts" },
] as const

function withProject(href: string, project: string | null) {
  if (!project) return href
  const separator = href.includes("?") ? "&" : "?"
  return `${href}${separator}project=${encodeURIComponent(project)}`
}

export function DocsSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const project = searchParams.get("project")

  return (
    <nav className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-y-auto border-r border-[var(--relay-line)] py-16 pl-4 pr-6 md:block">
      <Link href={withProject("/", project)} className="text-sm font-bold tracking-tight text-[var(--relay-ink)]">
        Relay Docs
      </Link>
      <ul className="mt-6 space-y-1">
        {sections.map((section) => {
          const href = withProject(section.href, project)
          const isActive = pathname === section.href

          return (
            <li key={section.href}>
              <Link
                href={href}
                className={cn(
                  "block rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-[var(--relay-soft)] text-[var(--relay-ink)]"
                    : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
                )}
              >
                {section.label}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="mt-8 border-t border-[var(--relay-line)] pt-4">
        <Link
          href={project ? `/dashboard?project=${encodeURIComponent(project)}` : "/dashboard"}
          className="block text-[12px] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
        >
          &larr; Back to dashboard
        </Link>
      </div>
    </nav>
  )
}
