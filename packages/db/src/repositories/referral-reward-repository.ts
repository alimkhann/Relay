import type { ReferralRewardRow } from "@relay/shared"

import { toReferralRewardRow } from "../mappers/referral-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ReferralRewardRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByReferralId(referralId: string): Promise<ReferralRewardRow | null> {
    const rows = await this.provider.query(
      `select * from referral_rewards where referral_id = $1 limit 1`,
      [referralId],
    )
    return rows[0] ? toReferralRewardRow(rows[0] as Record<string, unknown>) : null
  }

  async listByUserId(userId: string): Promise<ReferralRewardRow[]> {
    const rows = await this.provider.query(
      `select * from referral_rewards where user_id = $1 order by created_at desc`,
      [userId],
    )
    return rows.map((row) => toReferralRewardRow(row as Record<string, unknown>))
  }

  async create(input: {
    referralId: string
    userId: string
    basisPoints: number
    valueCents: number
    status: ReferralRewardRow["status"]
  }): Promise<ReferralRewardRow> {
    const rows = await this.provider.query(
      `insert into referral_rewards (referral_id, user_id, basis_points, value_cents, status)
       values ($1, $2, $3, $4, $5)
       on conflict (referral_id) do update set referral_id = referral_rewards.referral_id
       returning *`,
      [input.referralId, input.userId, input.basisPoints, input.valueCents, input.status],
    )
    return toReferralRewardRow(rows[0] as Record<string, unknown>)
  }

  async markApplied(id: string, providerDiscountId: string | null): Promise<ReferralRewardRow> {
    const rows = await this.provider.query(
      `update referral_rewards
       set status = 'applied',
           provider_discount_id = $2,
           applied_at = coalesce(applied_at, now()),
           updated_at = now()
       where id = $1
       returning *`,
      [id, providerDiscountId],
    )
    return toReferralRewardRow(rows[0] as Record<string, unknown>)
  }
}
