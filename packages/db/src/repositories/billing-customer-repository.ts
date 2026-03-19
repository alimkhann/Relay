import type { BillingCustomerRow } from "@relay/shared"

import { toBillingCustomerRow } from "../mappers/billing-mapper"
import type { DatabaseProvider } from "../store/provider"

export class BillingCustomerRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async getByUserId(userId: string): Promise<BillingCustomerRow | null> {
    const rows = await this.provider.query(
      `select * from billing_customers where user_id = $1 limit 1`,
      [userId],
    )
    const row = rows[0]
    return row ? toBillingCustomerRow(row as Record<string, unknown>) : null
  }

  async upsert(input: {
    userId: string
    externalCustomerId: string
    providerCustomerId?: string | null
    email?: string | null
    name?: string | null
    trialClaimedAt?: string | null
  }): Promise<BillingCustomerRow> {
    const rows = await this.provider.query(
      `insert into billing_customers (
         user_id, provider_customer_id, external_customer_id, email, name, trial_claimed_at
       )
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id) do update set
         provider_customer_id = coalesce(excluded.provider_customer_id, billing_customers.provider_customer_id),
         external_customer_id = excluded.external_customer_id,
         email = coalesce(excluded.email, billing_customers.email),
         name = coalesce(excluded.name, billing_customers.name),
         trial_claimed_at = coalesce(excluded.trial_claimed_at, billing_customers.trial_claimed_at),
         updated_at = now()
       returning *`,
      [
        input.userId,
        input.providerCustomerId ?? null,
        input.externalCustomerId,
        input.email ?? null,
        input.name ?? null,
        input.trialClaimedAt ?? null,
      ],
    )

    return toBillingCustomerRow(rows[0] as Record<string, unknown>)
  }
}
