import type { BillingWebhookEventRow } from "@relay/shared"

import { toBillingWebhookEventRow } from "../mappers/billing-mapper"
import type { DatabaseProvider } from "../store/provider"

export class BillingWebhookEventRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async createIfAbsent(input: {
    providerEventId: string
    eventType: string
    payload: Record<string, unknown>
  }): Promise<{ created: boolean; record: BillingWebhookEventRow }> {
    const rows = await this.provider.query(
      `insert into billing_webhook_events (provider_event_id, event_type, payload)
       values ($1, $2, $3::jsonb)
       on conflict (provider_event_id) do update set provider_event_id = billing_webhook_events.provider_event_id
       returning *, xmax = 0 as inserted`,
      [input.providerEventId, input.eventType, JSON.stringify(input.payload)],
    )
    const row = rows[0] as Record<string, unknown>
    return {
      created: Boolean(row.inserted),
      record: toBillingWebhookEventRow(row),
    }
  }

  async markProcessed(id: string): Promise<void> {
    await this.provider.query(
      `update billing_webhook_events set status = 'processed', processed_at = now(), updated_at = now() where id = $1`,
      [id],
    )
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.provider.query(
      `update billing_webhook_events set status = 'failed', error_message = $2, updated_at = now() where id = $1`,
      [id, errorMessage],
    )
  }
}
