import type { UsageCounterRow } from "@relay/shared"

import { toUsageCounterRow } from "../mappers/billing-mapper"
import type { DatabaseProvider } from "../store/provider"

export class UsageCounterRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async get(scopeKey: string, featureKey: string, windowKey: string, windowStart: string): Promise<UsageCounterRow | null> {
    const rows = await this.provider.query(
      `select * from usage_counters where scope_key = $1 and feature_key = $2 and window_key = $3 and window_start = $4::timestamptz limit 1`,
      [scopeKey, featureKey, windowKey, windowStart],
    )
    const row = rows[0]
    return row ? toUsageCounterRow(row as Record<string, unknown>) : null
  }

  async increment(scopeKey: string, featureKey: string, windowKey: string, windowStart: string, windowEnd: string, amount = 1): Promise<UsageCounterRow> {
    const rows = await this.provider.query(
      `insert into usage_counters (scope_key, feature_key, window_key, window_start, window_end, count)
       values ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6)
       on conflict (scope_key, feature_key, window_key, window_start)
       do update set count = usage_counters.count + excluded.count, window_end = excluded.window_end, updated_at = now()
       returning *`,
      [scopeKey, featureKey, windowKey, windowStart, windowEnd, amount],
    )
    return toUsageCounterRow(rows[0] as Record<string, unknown>)
  }

  async incrementWithinLimit(scopeKey: string, featureKey: string, windowKey: string, windowStart: string, windowEnd: string, limit: number, amount = 1): Promise<UsageCounterRow | null> {
    const rows = await this.provider.query(
      `insert into usage_counters (scope_key, feature_key, window_key, window_start, window_end, count)
       values ($1,$2,$3,$4::timestamptz,$5::timestamptz,$7)
       on conflict (scope_key, feature_key, window_key, window_start)
       do update set count = usage_counters.count + $7,
                     window_end = EXCLUDED.window_end,
                     updated_at = now()
       where usage_counters.count + $7 <= $6
       returning *`,
      [scopeKey, featureKey, windowKey, windowStart, windowEnd, limit, amount],
    )
    const row = rows[0]
    return row ? toUsageCounterRow(row as Record<string, unknown>) : null
  }
}
