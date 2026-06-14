import { createWorkerRepositoryBundle } from "@relay/db"

import {
  sendBriefSuperpowerEmail,
  sendConnectAgentEmail,
  sendMemoryRecapEmail,
  sendReactivationEmail,
} from "./email-service"
import { logServerEvent } from "@/server/logging/logger"

const DAY_MS = 86_400_000

export type LifecycleEmailKey = "day1_brief" | "day3_agent" | "day7_recap" | "reactivation_v1"

export interface LifecycleUserSignals {
  userId: string
  email: string | null
  name: string | null
  createdAtMs: number
  lastCaptureAtMs: number | null
  hasCaptured: boolean
  hasBriefViewed: boolean
  hasMcp: boolean
}

/**
 * Pure decision: which single lifecycle email (if any) a user is due for right
 * now. Idempotency is handled separately (per-key claim), so this only needs to
 * pick the most relevant message for the user's current state. Kept pure so the
 * cadence is unit-testable without touching the DB or Resend.
 */
export function decideDueLifecycleEmail(
  u: LifecycleUserSignals,
  nowMs: number,
): LifecycleEmailKey | null {
  if (!u.email) return null

  const ageDays = (nowMs - u.createdAtMs) / DAY_MS

  // Cooled-off reactivation takes priority over the early-drip windows.
  if (u.hasCaptured && u.lastCaptureAtMs != null) {
    const idleDays = (nowMs - u.lastCaptureAtMs) / DAY_MS
    if (idleDays >= 10) return "reactivation_v1"
  }

  if (ageDays >= 7 && ageDays < 14 && u.hasCaptured) return "day7_recap"
  if (ageDays >= 3 && ageDays < 7 && !u.hasMcp) return "day3_agent"
  if (ageDays >= 1 && ageDays < 3 && u.hasCaptured && !u.hasBriefViewed) return "day1_brief"

  return null
}

async function sendForKey(key: LifecycleEmailKey, u: LifecycleUserSignals): Promise<void> {
  if (!u.email) return
  switch (key) {
    case "day1_brief":
      return sendBriefSuperpowerEmail(u.email, u.name)
    case "day3_agent":
      return sendConnectAgentEmail(u.email, u.name)
    case "day7_recap":
      return sendMemoryRecapEmail(u.email, u.name)
    case "reactivation_v1":
      return sendReactivationEmail(u.email, u.name)
  }
}

interface WorkerProvider {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}

/**
 * Claim the right to send one email to one user, exactly once. Reuses the
 * `user_milestones` unique (user_id, event_name) constraint as the idempotency
 * guard — no new table/migration — namespacing keys with `email:` so they never
 * collide with funnel milestones. Returns true only on the first claim.
 */
async function claimEmailSend(
  provider: WorkerProvider,
  userId: string,
  key: LifecycleEmailKey,
): Promise<boolean> {
  const rows = await provider.query<{ user_id: string }>(
    `insert into user_milestones (user_id, event_name, properties)
     values ($1, $2, '{}'::jsonb)
     on conflict (user_id, event_name) do nothing
     returning user_id`,
    [userId, `email:${key}`],
  )
  return rows.length > 0
}

interface CandidateRow {
  user_id: string
  email: string | null
  name: string | null
  created_ms: string | number | null
  last_capture_ms: string | number | null
  has_captured: boolean
  has_brief_viewed: boolean
  has_mcp: boolean
}

function toNumber(value: string | number | null): number | null {
  if (value == null) return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Send due lifecycle/reactivation emails. Driven by the existing daily cron — no
 * new scheduler, no extra DB wake-ups (runs on the cron's compute). Dark unless
 * RELAY_LIFECYCLE_EMAILS === "true" so templates can be reviewed before anything
 * reaches a real inbox. Bounded by `sendCap` and `maxMs`.
 */
export async function drainLifecycleEmails(
  opts: { sendCap?: number; maxMs?: number; now?: number } = {},
): Promise<{ skipped?: string; considered: number; sent: number }> {
  if (process.env["RELAY_LIFECYCLE_EMAILS"] !== "true") {
    return { skipped: "disabled", considered: 0, sent: 0 }
  }

  const startedAt = Date.now()
  const nowMs = opts.now ?? startedAt
  const sendCap = Math.min(Math.max(opts.sendCap ?? 30, 1), 200)
  const maxMs = Math.min(Math.max(opts.maxMs ?? 12_000, 250), 60_000)

  const repositories = createWorkerRepositoryBundle()
  const provider = repositories.provider as unknown as WorkerProvider

  // Candidate scan is cheap at current scale; per-key claim dedupes sends.
  const rows = await provider.query<CandidateRow>(
    `select u.id as user_id,
            u.email as email,
            u.name as name,
            extract(epoch from u."createdAt") * 1000 as created_ms,
            (select extract(epoch from max(c.created_at)) * 1000
               from capture_events c where c.user_id = u.id) as last_capture_ms,
            exists(select 1 from user_milestones m
                   where m.user_id = u.id and m.event_name = 'first_session_captured') as has_captured,
            exists(select 1 from user_milestones m
                   where m.user_id = u.id and m.event_name = 'first_brief_viewed') as has_brief_viewed,
            exists(select 1 from user_milestones m
                   where m.user_id = u.id and m.event_name = 'mcp_connected_first_time') as has_mcp
       from neon_auth."user" u
      where u.email is not null
        and u."createdAt" > now() - interval '60 days'
      order by u."createdAt" desc
      limit 300`,
  )

  let considered = 0
  let sent = 0

  for (const row of rows) {
    if (sent >= sendCap || Date.now() - startedAt >= maxMs) break
    considered++

    const createdAtMs = toNumber(row.created_ms)
    if (createdAtMs == null) continue

    const signals: LifecycleUserSignals = {
      userId: row.user_id,
      email: row.email,
      name: row.name,
      createdAtMs,
      lastCaptureAtMs: toNumber(row.last_capture_ms),
      hasCaptured: Boolean(row.has_captured),
      hasBriefViewed: Boolean(row.has_brief_viewed),
      hasMcp: Boolean(row.has_mcp),
    }

    const key = decideDueLifecycleEmail(signals, nowMs)
    if (!key) continue

    try {
      // Claim the send first (idempotent), then send. Both are inside the
      // try so one bad row (e.g. an auth user without a profiles FK row, or a
      // transient DB/Resend error) can never abort the whole batch.
      const claimed = await claimEmailSend(provider, signals.userId, key)
      if (!claimed) continue
      await sendForKey(key, signals)
      sent++
    } catch (error) {
      await logServerEvent({
        level: "warn",
        surface: "web-api",
        area: "lifecycle_email",
        event: "lifecycle_email_send_failed",
        userId: signals.userId,
        message: error instanceof Error ? error.message : "Lifecycle email send failed.",
        context: { emailKey: key },
      }).catch(() => {})
    }
  }

  return { considered, sent }
}
