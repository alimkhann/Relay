"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/cn"
import { sectionGroups } from "@/components/docs/docs-sidebar"

function withProject(href: string, project: string | null) {
  if (!project) return href
  const separator = href.includes("?") ? "&" : "?"
  return `${href}${separator}project=${encodeURIComponent(project)}`
}

export function DocsMobileNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const project = searchParams.get("project")
  const [open, setOpen] = useState(false)

  let currentLabel = "Navigation"
  for (const group of sectionGroups) {
    for (const item of group.items) {
      if (pathname === item.href) {
        currentLabel = item.label
      }
    }
  }

  return (
    <div className="sticky top-0 z-20 border-b border-[var(--relay-line)] bg-[var(--relay-bg)] md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-3 text-[13px] font-semibold text-[var(--relay-ink)]"
      >
        <span>{currentLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[var(--relay-faint)] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <nav className="border-t border-[var(--relay-line)] px-6 py-3">
          {sectionGroups.map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--relay-muted)] mb-1.5">
                {group.label}
              </h4>
              <ul className="space-y-0.5">
                {group.items.map((section) => {
                  const href = withProject(section.href, project)
                  const isActive = pathname === section.href

                  return (
                    <li key={section.href}>
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
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

          <div className="mt-3 border-t border-[var(--relay-line)] pt-3">
            <Link
              href={project ? `/dashboard?project=${encodeURIComponent(project)}` : "/dashboard"}
              onClick={() => setOpen(false)}
              className="block text-[12px] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
            >
              &larr; Back to dashboard
            </Link>
          </div>
        </nav>
      )}
    </div>
  )
}
