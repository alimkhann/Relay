"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"

interface DocsFooterNavProps {
  previous?: { href: string; label: string }
  next?: { href: string; label: string }
}

function withProject(href: string, project: string | null) {
  if (!project) return href
  const separator = href.includes("?") ? "&" : "?"
  return `${href}${separator}project=${encodeURIComponent(project)}`
}

export function DocsFooterNav({ previous, next }: DocsFooterNavProps) {
  const searchParams = useSearchParams()
  const project = searchParams.get("project")

  if (!previous && !next) {
    return null
  }

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--relay-line)] pt-6 sm:flex-row sm:items-stretch sm:justify-between">
      {previous ? (
        <Link
          href={withProject(previous.href, project)}
          className="flex-1 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-5 py-4 transition hover:border-[var(--relay-accent)]/30 hover:bg-[var(--relay-soft)]"
        >
          <span className="block text-[11px] text-[var(--relay-muted)]">Previous</span>
          <span className="block text-[13px] font-medium text-[var(--relay-ink)]">&larr; {previous.label}</span>
        </Link>
      ) : <span />}
      {next ? (
        <Link
          href={withProject(next.href, project)}
          className="flex-1 rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-5 py-4 text-right transition hover:border-[var(--relay-accent)]/30 hover:bg-[var(--relay-soft)] ml-auto"
        >
          <span className="block text-[11px] text-[var(--relay-muted)]">Next</span>
          <span className="block text-[13px] font-medium text-[var(--relay-ink)]">{next.label} &rarr;</span>
        </Link>
      ) : null}
    </div>
  )
}
