"use client"

import { useSearchParams } from "next/navigation"

import { Sidebar } from "@/components/layout/sidebar"
import { CommandPalette } from "@/components/layout/command-palette"

interface WorkspaceSidebarShellProps {
  projects: { id: string; name: string }[]
  user: {
    name: string
    email?: string
  } | null
}

export function WorkspaceSidebarShell({
  projects,
  user,
}: WorkspaceSidebarShellProps) {
  const searchParams = useSearchParams()
  const currentProjectId = searchParams.get("project") ?? projects[0]?.id

  return (
    <>
      <Sidebar
        projects={projects}
        currentProjectId={currentProjectId}
        user={user}
      />
      <CommandPalette
        projects={projects}
        currentProjectId={currentProjectId}
      />
    </>
  )
}
