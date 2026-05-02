import type { ReferralCodeRow, ReferralRewardRow, ReferralRow } from "@relay/shared"

import { toTimestamp } from "./timestamp"

export function toReferralCodeRow(record: Record<string, unknown>): ReferralCodeRow {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    code: String(record.code),
    createdAt: toTimestamp(record.created_at),
  }
}

export function toReferralRow(record: Record<string, unknown>): ReferralRow {
  return {
    id: String(record.id),
    referrerId: String(record.referrer_id),
    refereeId: String(record.referee_id),
    referralCodeId: String(record.referral_code_id),
    refereeEmail: record.referee_email ? String(record.referee_email) : null,
    status: record.status as ReferralRow["status"],
    planKey: record.plan_key ? (record.plan_key as ReferralRow["planKey"]) : null,
    interval: record.interval ? (record.interval as ReferralRow["interval"]) : null,
    providerSubscriptionId: record.provider_subscription_id ? String(record.provider_subscription_id) : null,
    paidInvoiceCount: Number(record.paid_invoice_count ?? 0),
    firstPaidAt: record.first_paid_at ? toTimestamp(record.first_paid_at) : null,
    lastPaidPeriodStart: record.last_paid_period_start ? toTimestamp(record.last_paid_period_start) : null,
    activatedAt: record.activated_at ? toTimestamp(record.activated_at) : null,
    qualifiedAt: record.qualified_at ? toTimestamp(record.qualified_at) : null,
    rejectedAt: record.rejected_at ? toTimestamp(record.rejected_at) : null,
    rejectionReason: record.rejection_reason ? String(record.rejection_reason) : null,
    createdAt: toTimestamp(record.created_at),
    updatedAt: toTimestamp(record.updated_at),
  }
}

export function toReferralRewardRow(record: Record<string, unknown>): ReferralRewardRow {
  return {
    id: String(record.id),
    referralId: String(record.referral_id),
    userId: String(record.user_id),
    basisPoints: Number(record.basis_points ?? 0),
    valueCents: Number(record.value_cents ?? 0),
    status: record.status as ReferralRewardRow["status"],
    providerDiscountId: record.provider_discount_id ? String(record.provider_discount_id) : null,
    appliedAt: record.applied_at ? toTimestamp(record.applied_at) : null,
    revokedAt: record.revoked_at ? toTimestamp(record.revoked_at) : null,
    createdAt: toTimestamp(record.created_at),
    updatedAt: toTimestamp(record.updated_at),
  }
}
