import type { ReferralCodeRow } from "@relay/shared"

import { toReferralCodeRow } from "../mappers/referral-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ReferralCodeRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByUserId(userId: string): Promise<ReferralCodeRow | null> {
    const rows = await this.provider.query(
      `select * from referral_codes where user_id = $1 limit 1`,
      [userId],
    )
    return rows[0] ? toReferralCodeRow(rows[0] as Record<string, unknown>) : null
  }

  async getByCode(code: string): Promise<ReferralCodeRow | null> {
    const rows = await this.provider.query(
      `select * from referral_codes where code = $1 limit 1`,
      [code],
    )
    return rows[0] ? toReferralCodeRow(rows[0] as Record<string, unknown>) : null
  }

  async create(input: { userId: string; code: string }): Promise<ReferralCodeRow> {
    const rows = await this.provider.query(
      `insert into referral_codes (user_id, code)
       values ($1, $2)
       returning *`,
      [input.userId, input.code],
    )
    return toReferralCodeRow(rows[0] as Record<string, unknown>)
  }
}
