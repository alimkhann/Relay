"use client"

import { useSearchParams } from "next/navigation"
import { Menu } from "lucide-react"

import { Sidebar } from "@/components/layout/sidebar"
import { CommandPalette } from "@/components/layout/command-palette"
import { useSidebar } from "@/components/layout/sidebar-context"

interface WorkspaceSidebarShellProps {
  projects: { id: string; name: string }[]
  user: {
    name: string
    email?: string
  } | null
  referral?: { code: string; link: string; qualifiedCount: number }
  plan?: { plan: string; isPaid: boolean; capturesUsed: number; capturesLimit: number }
}

export function WorkspaceSidebarShell({
  projects,
  user,
  referral,
  plan,
}: WorkspaceSidebarShellProps) {
  const searchParams = useSearchParams()
  const currentProjectId = searchParams.get("project") ?? projects[0]?.id
  const { setMobileOpen } = useSidebar()

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-30 inline-flex h-9 w-9 items-center justify-center rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-surface)] text-[var(--relay-ink)] shadow-sm transition hover:bg-[var(--relay-soft)] md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      <Sidebar
        projects={projects}
        currentProjectId={currentProjectId}
        user={user}
        referral={referral}
        plan={plan}
      />
      <CommandPalette
        projects={projects}
        currentProjectId={currentProjectId}
      />
    </>
  )
}
