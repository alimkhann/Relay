import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { ChatPageShell } from "@/components/assistant/chat-page-shell"
import { requirePageViewer } from "@/server/policies/viewer"
import { resolveViewerEntitlements } from "@/server/services/entitlement-service"
import { listProjectsForUser } from "@/server/services/project-service"

export const dynamic = "force-dynamic"

export default async function ChatPage({
  searchParams
}: {
  searchParams: Promise<{ project?: string; chatId?: string }>
}) {
  const viewer = await requirePageViewer("/chat")
  const [projects, entitlements] = await Promise.all([
    listProjectsForUser(viewer.userId, { includePersonal: true }),
    resolveViewerEntitlements(viewer.userId)
  ])

  const { project: selectedProjectId, chatId } = await searchParams
  // Personal is selectable by explicit ?project=, but never the implicit default.
  const defaultProject = projects.find((p) => p.kind !== "personal") ?? projects[0] ?? null
  const currentProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId) ?? null
    : defaultProject

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        pageName="chat"
        pageGroup="workspace"
        message="Rendered the chat page."
        context={{ projectId: currentProject?.id ?? null }}
      />
      <ChatPageShell
        projectId={currentProject?.id ?? null}
        plan={entitlements.plan}
        initialChatId={chatId ?? null}
      />
    </>
  )
}
