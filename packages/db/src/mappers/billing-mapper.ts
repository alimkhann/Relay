import type {
  BillingCustomerRow,
  BillingWebhookEventRow,
  BillingWebhookRawDeliveryRow,
  BillingWebhookRawDeliveryStatus,
  EntitlementRow,
  SubscriptionRow,
  UsageCounterRow,
} from "@relay/shared"

export function toBillingCustomerRow(record: Record<string, unknown>): BillingCustomerRow {
  return {
    userId: String(record.user_id),
    provider: "polar",
    providerCustomerId: record.provider_customer_id ? String(record.provider_customer_id) : null,
    externalCustomerId: String(record.external_customer_id),
    email: record.email ? String(record.email) : null,
    name: record.name ? String(record.name) : null,
    trialClaimedAt: record.trial_claimed_at ? String(record.trial_claimed_at) : null,
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  }
}

export function toSubscriptionRow(record: Record<string, unknown>): SubscriptionRow {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    provider: "polar",
    providerSubscriptionId: String(record.provider_subscription_id),
    providerCustomerId: record.provider_customer_id ? String(record.provider_customer_id) : null,
    productId: record.product_id ? String(record.product_id) : null,
    planKey: (record.plan_key as SubscriptionRow["planKey"]) ?? "free",
    status: (record.status as SubscriptionRow["status"]) ?? "inactive",
    interval: (record.interval as SubscriptionRow["interval"]) ?? null,
    cancelAtPeriodEnd: Boolean(record.cancel_at_period_end),
    currentPeriodStart: record.current_period_start ? String(record.current_period_start) : null,
    currentPeriodEnd: record.current_period_end ? String(record.current_period_end) : null,
    trialStartsAt: record.trial_starts_at ? String(record.trial_starts_at) : null,
    trialEndsAt: record.trial_ends_at ? String(record.trial_ends_at) : null,
    raw: (record.raw as Record<string, unknown>) ?? {},
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  }
}

export function toEntitlementRow(record: Record<string, unknown>): EntitlementRow {
  return {
    userId: String(record.user_id),
    planKey: (record.plan_key as EntitlementRow["planKey"]) ?? "free",
    status: (record.status as EntitlementRow["status"]) ?? "inactive",
    providerCustomerId: record.provider_customer_id ? String(record.provider_customer_id) : null,
    providerSubscriptionId: record.provider_subscription_id ? String(record.provider_subscription_id) : null,
    interval: (record.interval as EntitlementRow["interval"]) ?? null,
    activeProjectsLimit: Number(record.active_projects_limit ?? 0),
    historyRetentionDays: Number(record.history_retention_days ?? 0),
    captureLimitMonthly: Number(record.capture_limit_monthly ?? 0),
    mcpReadLimitDaily: Number(record.mcp_read_limit_daily ?? 0),
    mcpWriteLimitDaily: Number(record.mcp_write_limit_daily ?? 0),
    handoffEnabled: Boolean(record.handoff_enabled),
    trialEndsAt: record.trial_ends_at ? String(record.trial_ends_at) : null,
    currentPeriodEnd: record.current_period_end ? String(record.current_period_end) : null,
    updatedAt: String(record.updated_at),
  }
}

export function toUsageCounterRow(record: Record<string, unknown>): UsageCounterRow {
  return {
    id: String(record.id),
    scopeKey: String(record.scope_key),
    featureKey: String(record.feature_key),
    windowKey: String(record.window_key),
    windowStart: String(record.window_start),
    windowEnd: String(record.window_end),
    count: Number(record.count ?? 0),
    updatedAt: String(record.updated_at),
  }
}

export function toBillingWebhookEventRow(record: Record<string, unknown>): BillingWebhookEventRow {
  return {
    id: String(record.id),
    provider: "polar",
    providerEventId: String(record.provider_event_id),
    eventType: String(record.event_type),
    payload: (record.payload as Record<string, unknown>) ?? {},
    status: (record.status as BillingWebhookEventRow["status"]) ?? "pending",
    errorMessage: record.error_message ? String(record.error_message) : null,
    processedAt: record.processed_at ? String(record.processed_at) : null,
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  }
}

export function toBillingWebhookRawDeliveryRow(
  record: Record<string, unknown>,
): BillingWebhookRawDeliveryRow {
  return {
    id: String(record.id),
    provider: "polar",
    polarEventId: record.polar_event_id ? String(record.polar_event_id) : null,
    polarEventType: record.polar_event_type ? String(record.polar_event_type) : null,
    headers: (record.headers as Record<string, unknown>) ?? {},
    bodyHash: record.body_hash ? String(record.body_hash) : null,
    bodyLength: record.body_length == null ? null : Number(record.body_length),
    status: (record.status as BillingWebhookRawDeliveryStatus) ?? "received",
    errorMessage: record.error_message ? String(record.error_message) : null,
    receivedAt: String(record.received_at),
    processedAt: record.processed_at ? String(record.processed_at) : null,
    updatedAt: String(record.updated_at),
  }
}
