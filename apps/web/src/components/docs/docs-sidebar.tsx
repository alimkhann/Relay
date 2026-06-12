"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/cn"
import { resolveDocsBackLink } from "@/components/docs/docs-back-link"

export const sectionGroups = [
  {
    label: "Getting Started",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/getting-started", label: "Getting Started" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/docs/extension", label: "Chrome Extension" },
      { href: "/docs/mcp", label: "MCP Integration" },
    ],
  },
  {
    label: "Reference",
    items: [
      { href: "/docs/api", label: "API Reference" },
      { href: "/docs/concepts", label: "Concepts" },
      { href: "/docs/plans", label: "Plans & Limits" },
    ],
  },
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
  const from = searchParams.get("from")
  const back = resolveDocsBackLink(from, project)

  return (
    <nav className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-y-auto border-r border-[var(--relay-line)] py-16 pl-4 pr-6 md:block">
      <Link href={withProject("/", project)} className="text-sm font-bold tracking-tight text-[var(--relay-ink)]">
        Relay Docs
      </Link>
      <div className="mt-6">
        {sectionGroups.map((group, groupIndex) => (
          <div key={group.label}>
            <h4
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wider text-[var(--relay-muted)] mb-1.5 px-3",
                groupIndex === 0 ? "mt-0" : "mt-5",
              )}
            >
              {group.label}
            </h4>
            <ul className="space-y-1">
              {group.items.map((section) => {
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
          </div>
        ))}
      </div>
      <div className="mt-8 border-t border-[var(--relay-line)] pt-4">
        <Link
          href={back.href}
          className="block text-[12px] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
        >
          &larr; {back.label}
        </Link>
      </div>
    </nav>
  )
}
