import type { SubscriptionRow } from "@relay/shared"

import { toSubscriptionRow } from "../mappers/billing-mapper"
import type { DatabaseProvider } from "../store/provider"

export class SubscriptionRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async listByUser(userId: string): Promise<SubscriptionRow[]> {
    const rows = await this.provider.query(
      `select * from subscriptions where user_id = $1 order by updated_at desc`,
      [userId],
    )
    return rows.map((row) => toSubscriptionRow(row as Record<string, unknown>))
  }

  async upsertMany(
    userId: string,
    subscriptions: Array<{
      providerSubscriptionId: string
      providerCustomerId?: string | null
      productId?: string | null
      planKey: SubscriptionRow["planKey"]
      status: SubscriptionRow["status"]
      interval: SubscriptionRow["interval"]
      cancelAtPeriodEnd?: boolean
      currentPeriodStart?: string | null
      currentPeriodEnd?: string | null
      trialStartsAt?: string | null
      trialEndsAt?: string | null
      raw?: Record<string, unknown>
    }>,
  ) {
    for (const subscription of subscriptions) {
      await this.provider.query(
        `insert into subscriptions (
           user_id, provider_subscription_id, provider_customer_id, product_id, plan_key, status, interval,
           cancel_at_period_end, current_period_start, current_period_end, trial_starts_at, trial_ends_at, raw
         )
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
         on conflict (provider_subscription_id) do update set
           user_id = excluded.user_id,
           provider_customer_id = excluded.provider_customer_id,
           product_id = excluded.product_id,
           plan_key = excluded.plan_key,
           status = excluded.status,
           interval = excluded.interval,
           cancel_at_period_end = excluded.cancel_at_period_end,
           current_period_start = excluded.current_period_start,
           current_period_end = excluded.current_period_end,
           trial_starts_at = excluded.trial_starts_at,
           trial_ends_at = excluded.trial_ends_at,
           raw = excluded.raw,
           updated_at = now()`,
        [
          userId,
          subscription.providerSubscriptionId,
          subscription.providerCustomerId ?? null,
          subscription.productId ?? null,
          subscription.planKey,
          subscription.status,
          subscription.interval,
          subscription.cancelAtPeriodEnd ?? false,
          subscription.currentPeriodStart ?? null,
          subscription.currentPeriodEnd ?? null,
          subscription.trialStartsAt ?? null,
          subscription.trialEndsAt ?? null,
          JSON.stringify(subscription.raw ?? {}),
        ],
      )
    }
  }

  async markMissingAsCanceled(userId: string, activeProviderSubscriptionIds: string[]) {
    await this.provider.query(
      `update subscriptions
       set status = 'canceled', updated_at = now()
       where user_id = $1
         and ($2::text[] = '{}'::text[] or provider_subscription_id <> all($2::text[]))
         and status <> 'canceled'`,
      [userId, activeProviderSubscriptionIds],
    )
  }
}
