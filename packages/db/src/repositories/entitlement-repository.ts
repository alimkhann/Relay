import type { EntitlementRow } from "@relay/shared"

import { toEntitlementRow } from "../mappers/billing-mapper"
import type { DatabaseProvider } from "../store/provider"

export class EntitlementRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByUserId(userId: string): Promise<EntitlementRow | null> {
    const rows = await this.provider.query(`select * from entitlements where user_id = $1 limit 1`, [userId])
    const row = rows[0]
    return row ? toEntitlementRow(row as Record<string, unknown>) : null
  }

  async upsert(input: EntitlementRow): Promise<EntitlementRow> {
    const rows = await this.provider.query(
      `insert into entitlements (
         user_id, plan_key, status, provider_customer_id, provider_subscription_id, interval,
         active_projects_limit, history_retention_days, capture_limit_monthly, mcp_read_limit_daily,
         mcp_write_limit_daily, handoff_enabled, trial_ends_at, current_period_end
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (user_id) do update set
         plan_key = excluded.plan_key,
         status = excluded.status,
         provider_customer_id = excluded.provider_customer_id,
         provider_subscription_id = excluded.provider_subscription_id,
         interval = excluded.interval,
         active_projects_limit = excluded.active_projects_limit,
         history_retention_days = excluded.history_retention_days,
         capture_limit_monthly = excluded.capture_limit_monthly,
         mcp_read_limit_daily = excluded.mcp_read_limit_daily,
         mcp_write_limit_daily = excluded.mcp_write_limit_daily,
         handoff_enabled = excluded.handoff_enabled,
         trial_ends_at = excluded.trial_ends_at,
         current_period_end = excluded.current_period_end,
         updated_at = now()
       returning *`,
      [
        input.userId,
        input.planKey,
        input.status,
        input.providerCustomerId,
        input.providerSubscriptionId,
        input.interval,
        input.activeProjectsLimit,
        input.historyRetentionDays,
        input.captureLimitMonthly,
        input.mcpReadLimitDaily,
        input.mcpWriteLimitDaily,
        input.handoffEnabled,
        input.trialEndsAt,
        input.currentPeriodEnd,
      ],
    )
    return toEntitlementRow(rows[0] as Record<string, unknown>)
  }
}
