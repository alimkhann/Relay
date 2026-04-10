import type { BillingWebhookRawDeliveryRow, BillingWebhookRawDeliveryStatus } from "@relay/shared"

import { toBillingWebhookRawDeliveryRow } from "../mappers/billing-mapper"
import type { DatabaseProvider } from "../store/provider"

export class BillingWebhookRawDeliveryRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async record(input: {
    polarEventId: string | null
    polarEventType: string | null
    headers: Record<string, unknown>
    bodyHash: string | null
    bodyLength: number | null
  }): Promise<BillingWebhookRawDeliveryRow> {
    const rows = await this.provider.query(
      `insert into billing_webhook_raw_deliveries
         (polar_event_id, polar_event_type, headers, body_hash, body_length)
       values ($1, $2, $3::jsonb, $4, $5)
       returning *`,
      [
        input.polarEventId,
        input.polarEventType,
        JSON.stringify(input.headers),
        input.bodyHash,
        input.bodyLength,
      ],
    )
    return toBillingWebhookRawDeliveryRow(rows[0] as Record<string, unknown>)
  }

  async markStatus(id: string, status: BillingWebhookRawDeliveryStatus, errorMessage?: string | null): Promise<void> {
    await this.provider.query(
      `update billing_webhook_raw_deliveries
         set status = $2,
             error_message = $3,
             processed_at = case when $2 in ('processed', 'ignored') then now() else processed_at end,
             updated_at = now()
       where id = $1`,
      [id, status, errorMessage ?? null],
    )
  }
}
