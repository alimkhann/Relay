import Link from "next/link"

import { cn } from "@/lib/cn"

export type ProjectTab = "canon" | "timeline" | "memory" | "packets" | "sessions" | "settings"

const TABS: { key: ProjectTab; label: string; href: (id: string) => string }[] = [
  { key: "canon", label: "Canon", href: (id) => `/projects/${id}` },
  { key: "timeline", label: "Timeline", href: (id) => `/projects/${id}/timeline` },
  { key: "memory", label: "Memory", href: (id) => `/projects/${id}/memory` },
  { key: "packets", label: "Packets", href: (id) => `/projects/${id}/packets` },
  { key: "sessions", label: "Sessions", href: (id) => `/projects/${id}/sessions` },
  { key: "settings", label: "Settings", href: (id) => `/projects/${id}/settings` },
]

export function ProjectTabs({
  projectId,
  projectName,
  active,
}: {
  projectId: string
  projectName: string
  active: ProjectTab
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--relay-muted)]">
            Project
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-[var(--relay-ink)]">
            {projectName}
          </h1>
        </div>
      </div>
      <nav
        aria-label="Project sections"
        className="flex items-center gap-1 overflow-x-auto border-b border-[var(--relay-line)]"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active
          return (
            <Link
              key={tab.key}
              href={tab.href(projectId)}
              className={cn(
                "relative whitespace-nowrap px-3 py-2 text-[13px] font-medium transition",
                isActive
                  ? "text-[var(--relay-ink)]"
                  : "text-[var(--relay-muted)] hover:text-[var(--relay-ink)]",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[var(--relay-ink)]"
                />
              ) : null}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
