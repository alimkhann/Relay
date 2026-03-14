"use client"

import type { ActivityEntry } from "@/server/services/activity-service"
import { ActivityFeed } from "@/features/activity/activity-feed"

export function WorkspaceActivityView({ feed }: { feed: ActivityEntry[] }) {
  return (
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
  )
}
