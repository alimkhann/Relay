import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { ChatView } from "@/components/assistant/chat-view"
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
    listProjectsForUser(viewer.userId),
    resolveViewerEntitlements(viewer.userId)
  ])

  const { project: selectedProjectId, chatId } = await searchParams
  const currentProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId) ?? null
    : projects[0] ?? null

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
      <div className="h-[80vh] overflow-hidden rounded-[var(--relay-radius-lg)] border border-[var(--relay-line)] bg-[var(--relay-bg)] shadow-[var(--relay-shadow)]">
        <ChatView
          surface="dashboard"
          projectId={currentProject?.id ?? null}
          plan={entitlements.plan}
          variant="page"
          initialChatId={chatId ?? null}
        />
      </div>
    </>
  )
}
