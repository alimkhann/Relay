import { PageTelemetry } from "@/components/telemetry/page-telemetry"
import { ActivityFeed } from "@/features/activity/activity-feed"
import { requirePageViewer } from "@/server/policies/viewer"
import { listActivityFeedForUser } from "@/server/services/activity-service"

export const dynamic = "force-dynamic"

export default async function ActivityPage() {
  const viewer = await requirePageViewer("/activity")
  const feed = await listActivityFeedForUser(viewer.userId)

  return (
    <>
      <PageTelemetry
        surface="web-dashboard"
        area="page"
        event="activity.viewed"
        message="Rendered the activity page."
      />
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--relay-ink)]">
            Activity
          </h1>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Recent captures and digest runs across all projects.
          </p>
        </div>
        <ActivityFeed feed={feed} />
      </div>
    </>
  )
}
