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
    <div className="flex flex-col gap-3 border-t border-[var(--relay-line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
      {previous ? (
        <Link
          href={withProject(previous.href, project)}
          className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-3 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft)]"
        >
          &larr; {previous.label}
        </Link>
      ) : <span />}
      {next ? (
        <Link
          href={withProject(next.href, project)}
          className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-3 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft)] sm:text-right"
        >
          {next.label} &rarr;
        </Link>
      ) : null}
    </div>
  )
}
