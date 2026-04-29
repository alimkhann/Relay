import type { BillingInterval, BillingPlanKey, ReferralRow } from "@relay/shared"

import { toReferralRow } from "../mappers/referral-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ReferralRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByRefereeId(refereeId: string): Promise<ReferralRow | null> {
    const rows = await this.provider.query(
      `select * from referrals where referee_id = $1 limit 1`,
      [refereeId],
    )
    return rows[0] ? toReferralRow(rows[0] as Record<string, unknown>) : null
  }

  async create(input: {
    referrerId: string
    refereeId: string
    referralCodeId: string
    refereeEmail?: string | null
  }): Promise<ReferralRow> {
    const rows = await this.provider.query(
      `insert into referrals (referrer_id, referee_id, referral_code_id, referee_email)
       values ($1, $2, $3, $4)
       on conflict (referee_id) do update set referee_id = referrals.referee_id
       returning *`,
      [input.referrerId, input.refereeId, input.referralCodeId, input.refereeEmail ?? null],
    )
    return toReferralRow(rows[0] as Record<string, unknown>)
  }

  async markActivated(id: string): Promise<ReferralRow> {
    const rows = await this.provider.query(
      `update referrals
       set status = case when status = 'pending_signup' then 'activated' else status end,
           activated_at = coalesce(activated_at, now()),
           updated_at = now()
       where id = $1
       returning *`,
      [id],
    )
    return toReferralRow(rows[0] as Record<string, unknown>)
  }

  async markPaid(input: {
    id: string
    providerSubscriptionId: string
    planKey: Exclude<BillingPlanKey, "free">
    interval: Exclude<BillingInterval, null>
    paidInvoiceCount: number
    firstPaidAt: string
    lastPaidPeriodStart?: string | null
  }): Promise<ReferralRow> {
    const rows = await this.provider.query(
      `update referrals
       set status = case when status in ('pending_signup', 'activated') then 'paid' else status end,
           provider_subscription_id = $2,
           plan_key = $3,
           interval = $4,
           paid_invoice_count = greatest(paid_invoice_count, $5),
           first_paid_at = coalesce(first_paid_at, $6::timestamptz),
           last_paid_period_start = $7::timestamptz,
           updated_at = now()
       where id = $1
       returning *`,
      [
        input.id,
        input.providerSubscriptionId,
        input.planKey,
        input.interval,
        input.paidInvoiceCount,
        input.firstPaidAt,
        input.lastPaidPeriodStart ?? null,
      ],
    )
    return toReferralRow(rows[0] as Record<string, unknown>)
  }

  async markQualified(id: string): Promise<ReferralRow> {
    const rows = await this.provider.query(
      `update referrals
       set status = case when status in ('paid', 'activated', 'pending_signup') then 'qualified' else status end,
           qualified_at = coalesce(qualified_at, now()),
           updated_at = now()
       where id = $1
       returning *`,
      [id],
    )
    return toReferralRow(rows[0] as Record<string, unknown>)
  }

  async rejectBySubscription(providerSubscriptionId: string, reason: string): Promise<ReferralRow | null> {
    const rows = await this.provider.query(
      `update referrals
       set status = case when status in ('pending_signup', 'activated', 'paid') then 'rejected' else status end,
           rejected_at = coalesce(rejected_at, now()),
           rejection_reason = coalesce(rejection_reason, $2),
           updated_at = now()
       where provider_subscription_id = $1
       returning *`,
      [providerSubscriptionId, reason],
    )
    return rows[0] ? toReferralRow(rows[0] as Record<string, unknown>) : null
  }

  async countQualifiedByReferrerSince(referrerId: string, since: string): Promise<number> {
    const rows = await this.provider.query<{ count: number }>(
      `select count(*)::int as count
       from referrals
       where referrer_id = $1
         and status in ('qualified', 'rewarded')
         and qualified_at >= $2::timestamptz`,
      [referrerId, since],
    )
    return Number(rows[0]?.count ?? 0)
  }
}
