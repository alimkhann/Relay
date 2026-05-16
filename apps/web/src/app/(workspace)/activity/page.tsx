import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { ActivityPageContent } from "@/features/activity/activity-feed"
import { requirePageViewer } from "@/server/policies/viewer"

export const dynamic = "force-dynamic"

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  await requirePageViewer("/activity")
  const { project: projectId } = await searchParams

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        pageName="activity"
        pageGroup="workspace"
        message="Rendered the activity page."
      />
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
            Activity
          </h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Recent captures and digest runs.
          </p>
        </div>
        <ActivityPageContent projectId={projectId} />
      </div>
    </>
  )
}
