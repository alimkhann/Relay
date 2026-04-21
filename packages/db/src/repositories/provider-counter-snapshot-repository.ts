import type { ProviderCounterSnapshotRow } from "@relay/shared"

import { toProviderCounterSnapshotRow } from "../mappers/billing-mapper"
import type { DatabaseProvider } from "../store/provider"

export class ProviderCounterSnapshotRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getLatest(
    providerName: ProviderCounterSnapshotRow["provider"],
    externalProjectId: string,
    beforeDate?: string,
  ): Promise<ProviderCounterSnapshotRow | null> {
    const rows = await this.provider.query(
      `select *
       from provider_counter_snapshots
       where provider = $1
         and external_project_id = $2
         ${beforeDate ? "and snapshot_date < $3::date" : ""}
       order by snapshot_date desc
       limit 1`,
      beforeDate ? [providerName, externalProjectId, beforeDate] : [providerName, externalProjectId],
    )
    const row = rows[0]
    return row ? toProviderCounterSnapshotRow(row as Record<string, unknown>) : null
  }

  async upsertDailySnapshot(input: {
    provider: ProviderCounterSnapshotRow["provider"]
    externalProjectId: string
    snapshotDate: string
    periodStart: string
    periodEnd: string
    billingMode?: string | null
    estimationMethod: string
    costUsd: number
    metrics: Record<string, unknown>
  }): Promise<ProviderCounterSnapshotRow> {
    const rows = await this.provider.query(
      `insert into provider_counter_snapshots (
         provider,
         external_project_id,
         snapshot_date,
         period_start,
         period_end,
         billing_mode,
         estimation_method,
         cost_usd,
         metrics
       )
       values ($1, $2, $3::date, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9::jsonb)
       on conflict (provider, external_project_id, snapshot_date)
       do update set
         period_start = excluded.period_start,
         period_end = excluded.period_end,
         billing_mode = excluded.billing_mode,
         estimation_method = excluded.estimation_method,
         cost_usd = excluded.cost_usd,
         metrics = excluded.metrics
       returning *`,
      [
        input.provider,
        input.externalProjectId,
        input.snapshotDate,
        input.periodStart,
        input.periodEnd,
        input.billingMode ?? null,
        input.estimationMethod,
        input.costUsd,
        JSON.stringify(input.metrics ?? {}),
      ],
    )

    return toProviderCounterSnapshotRow(rows[0] as Record<string, unknown>)
  }
}
