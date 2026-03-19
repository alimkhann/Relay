import { redirect } from "next/navigation"

import { createRepositoryBundle } from "@relay/db"
import { McpAuthorizationConfirm } from "@/components/mcp/mcp-authorization-confirm"
import { requirePageViewer } from "@/server/policies/viewer"

interface McpAuthorizePageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function McpAuthorizePage({ searchParams }: McpAuthorizePageProps) {
  const { code } = await searchParams
  if (!code) {
    redirect("/dashboard")
  }

  const viewer = await requirePageViewer(`/mcp/authorize?code=${code}`)
  const repositories = createRepositoryBundle(viewer.userId)
  const session = await repositories.mcpAuthSessions.getByCode(code)
  if (!session) {
    redirect("/dashboard")
  }

  const project = await repositories.projects.getById(session.projectId)
  if (!project) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--relay-bg)] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold text-[var(--relay-ink)]">Authorize Relay MCP</h1>
          <p className="text-sm text-[var(--relay-muted)]">Approve this coding tool to access one Relay project with scoped MCP permissions.</p>
        </div>
        <div className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-6">
          <McpAuthorizationConfirm sessionCode={code} projectName={project.name} scopes={session.scopes} />
        </div>
      </div>
    </div>
  )
}
