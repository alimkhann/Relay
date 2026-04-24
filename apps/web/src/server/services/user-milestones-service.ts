import { createRepositoryBundle } from "@relay/db"

import { logServerEvent } from "@/server/logging/logger"

export type UserMilestoneEvent =
  | "mcp_connected_first_time"
  | "first_project_detected"
  | "first_brief_generated"
  | "first_brief_inserted"

/**
 * Fire a first-value funnel event exactly once per user per milestone. The
 * `user_milestones` table acts as the idempotency guard, so retries, warm
 * restarts, and race conditions will not double-fire. The analytics event
 * only lands in PostHog when the insert actually added a row.
 */
export async function fireUserMilestone(
  userId: string,
  event: UserMilestoneEvent,
  properties: Record<string, string | number | boolean | null> = {},
): Promise<boolean> {
  if (!userId) return false

  const repositories = createRepositoryBundle(userId)
  const rows = await repositories.provider.query<{ user_id: string }>(
    `insert into user_milestones (user_id, event_name, properties)
     values ($1, $2, $3::jsonb)
     on conflict (user_id, event_name) do nothing
     returning user_id`,
    [userId, event, JSON.stringify(properties)],
  )

  if (rows.length === 0) {
    return false
  }

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "activation",
    event,
    userId,
    message: `First-value milestone ${event} reached for user ${userId}.`,
    context: properties,
  })

  return true
}
