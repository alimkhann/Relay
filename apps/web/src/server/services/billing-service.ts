import type { BillingSubscriptionStatus } from "@relay/shared"
import { Polar } from "@polar-sh/sdk"
import { SDKValidationError } from "@polar-sh/sdk/models/errors/sdkvalidationerror.js"
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks"
import { createRepositoryBundle } from "@relay/db"
import { billingCheckoutSchema, hashContent } from "@relay/shared"

import { BILLING_RETURN_URL, BILLING_SUCCESS_URL, PLAN_PRODUCT_IDS } from "./billing-config"
import {
  sendSubscriptionCanceledEmail,
  sendTrialStartedEmail,
  sendWelcomeToProEmail,
} from "./email-service"
import { buildEntitlementRowFromPlan, resolveViewerEntitlements } from "./entitlement-service"
import { ForbiddenError } from "@/server/http/errors"
import { logServerEvent } from "@/server/logging/logger"

type NormalizedSubscriptionInput = {
  providerSubscriptionId: string
  providerCustomerId: string | null
  productId: string | null
  planKey: "free" | "starter" | "pro"
  status: BillingSubscriptionStatus
  interval: "month" | "year" | null
  cancelAtPeriodEnd: boolean
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  trialStartsAt: string | null
  trialEndsAt: string | null
  raw: Record<string, unknown>
}

type PlanTransition =
  | "none"
  | "free_to_trial"
  | "free_to_paid"
  | "trial_to_paid"
  | "paid_to_free"
  | "paid_past_due"
  | "trial_canceled"

type BillingTransitionSnapshot = {
  planKey: "free" | "starter" | "pro"
  status: BillingSubscriptionStatus
  interval: "month" | "year" | null
  currentPeriodEnd: string | null
}

function detectPlanTransition(
  previous: { planKey: "free" | "starter" | "pro"; status: BillingSubscriptionStatus } | null,
  next: { planKey: "free" | "starter" | "pro"; status: BillingSubscriptionStatus },
): PlanTransition {
  const prevPlan = previous?.planKey ?? "free"
  const prevStatus = previous?.status ?? "inactive"

  if (prevPlan === next.planKey && prevStatus === next.status) return "none"

  if (prevPlan === "free" && next.planKey !== "free" && next.status === "trialing") {
    return "free_to_trial"
  }
  if (prevPlan === "free" && next.planKey !== "free" && next.status === "active") {
    return "free_to_paid"
  }
  if (prevPlan !== "free" && prevStatus === "trialing" && next.planKey !== "free" && next.status === "active") {
    return "trial_to_paid"
  }
  if (prevPlan !== "free" && prevStatus === "trialing" && next.planKey === "free") {
    return "trial_canceled"
  }
  if (prevPlan !== "free" && prevStatus !== "past_due" && next.status === "past_due") {
    return "paid_past_due"
  }
  if (prevPlan !== "free" && next.planKey === "free") {
    return "paid_to_free"
  }
  return "none"
}

async function fireTransitionEmail(
  transition: PlanTransition,
  recipient: {
    email: string | null
    name: string | null
    previous: BillingTransitionSnapshot | null
    next: BillingTransitionSnapshot
  },
) {
  if (!recipient.email) return

  try {
    switch (transition) {
      case "free_to_trial":
        await sendTrialStartedEmail(recipient.email, recipient.name, 3)
        return
      case "free_to_paid":
      case "trial_to_paid":
        await sendWelcomeToProEmail(recipient.email, {
          name: recipient.name,
          plan: recipient.next.planKey === "pro" ? "Pro" : "Starter",
          interval: recipient.next.interval,
          currentPeriodEnd: recipient.next.currentPeriodEnd,
        })
        return
      case "paid_to_free":
      case "trial_canceled":
        const previousPaidPlan =
          recipient.previous && recipient.previous.planKey !== "free"
            ? recipient.previous
            : recipient.next
        await sendSubscriptionCanceledEmail(recipient.email, {
          name: recipient.name,
          plan: previousPaidPlan.planKey === "pro" ? "Pro" : "Starter",
          currentPeriodEnd: previousPaidPlan.currentPeriodEnd ?? recipient.next.currentPeriodEnd,
        })
        return
      default:
        return
    }
  } catch (error) {
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "billing",
      event: "billing.transition_email_failed",
      message: "Failed to send plan transition email.",
      context: { transition, recipientName: recipient.name ? "present" : "null" },
      error,
    })
  }
}

function normalizePolarStatus(status: unknown): BillingSubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing"
    case "active":
      return "active"
    case "past_due":
      return "past_due"
    case "canceled":
    case "revoked":
      return "canceled"
    default:
      return "inactive"
  }
}

function pickActiveSubscription(subs: NormalizedSubscriptionInput[]): NormalizedSubscriptionInput | null {
  const activeStatuses = new Set<BillingSubscriptionStatus>(["active", "trialing", "past_due"])
  const planRank = { free: 0, starter: 1, pro: 2 } as const
  const activeSubs = subs.filter((s) => s.planKey !== "free" && activeStatuses.has(s.status))
  activeSubs.sort((a, b) => {
    const rankDelta = planRank[b.planKey] - planRank[a.planKey]
    if (rankDelta !== 0) return rankDelta
    return (b.currentPeriodEnd ?? "").localeCompare(a.currentPeriodEnd ?? "")
  })
  return activeSubs[0] ?? null
}

function coercePolarTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  return null
}

function getPolarClient() {
  const accessToken = process.env["POLAR_ACCESS_TOKEN"]
  if (!accessToken) {
    throw new Error("POLAR_ACCESS_TOKEN is not configured.")
  }

  const server = process.env["POLAR_SANDBOX"] === "true" ? "sandbox" : "production"
  return new Polar({ accessToken, server })
}

function resolveProductId(plan: "starter" | "pro", interval: "month" | "year") {
  const productId = interval === "year" ? PLAN_PRODUCT_IDS[plan].year : PLAN_PRODUCT_IDS[plan].month
  if (!productId) {
    throw new Error(`Polar product ID for ${interval}ly ${plan} is not configured.`)
  }
  return productId
}

function derivePlanFromProductId(productId: string | null | undefined) {
  if (!productId) return "free" as const
  if (productId === PLAN_PRODUCT_IDS.starter.month || productId === PLAN_PRODUCT_IDS.starter.year) {
    return "starter" as const
  }
  if (productId === PLAN_PRODUCT_IDS.pro.month || productId === PLAN_PRODUCT_IDS.pro.year) {
    return "pro" as const
  }
  return "free" as const
}

function deriveIntervalFromProductId(productId: string | null | undefined) {
  if (productId === PLAN_PRODUCT_IDS.starter.year || productId === PLAN_PRODUCT_IDS.pro.year) return "year" as const
  if (productId === PLAN_PRODUCT_IDS.starter.month || productId === PLAN_PRODUCT_IDS.pro.month) return "month" as const
  return null
}

function derivePlanFromMetadata(subscription: Record<string, unknown>) {
  const metadata = subscription.metadata
  if (!metadata || typeof metadata !== "object") return "free" as const
  const planRaw = (metadata as Record<string, unknown>).plan
  if (typeof planRaw !== "string") return "free" as const
  if (planRaw.startsWith("starter")) return "starter" as const
  if (planRaw.startsWith("pro")) return "pro" as const
  return "free" as const
}

function deriveIntervalFromMetadata(subscription: Record<string, unknown>) {
  const metadata = subscription.metadata
  if (!metadata || typeof metadata !== "object") return null
  const planRaw = (metadata as Record<string, unknown>).plan
  if (typeof planRaw !== "string") return null
  if (planRaw.endsWith("_monthly")) return "month" as const
  if (planRaw.endsWith("_yearly")) return "year" as const
  return null
}

function deriveProductIdFromSubscription(subscription: Record<string, unknown>) {
  if (typeof subscription.productId === "string") return subscription.productId

  const product = subscription.product
  if (product && typeof product === "object" && typeof (product as Record<string, unknown>).id === "string") {
    return (product as Record<string, unknown>).id as string
  }

  const price = subscription.price
  if (price && typeof price === "object") {
    const priceObj = price as Record<string, unknown>
    if (typeof priceObj.productId === "string") return priceObj.productId
    const nestedProduct = priceObj.product
    if (
      nestedProduct &&
      typeof nestedProduct === "object" &&
      typeof (nestedProduct as Record<string, unknown>).id === "string"
    ) {
      return (nestedProduct as Record<string, unknown>).id as string
    }
  }

  return null
}

export async function createPolarCheckoutForUser(user: {
  id: string
  email?: string | null
  name?: string | null
}, input: unknown) {
  const parsed = billingCheckoutSchema.parse(input)
  const currentEntitlements = await resolveViewerEntitlements(user.id)
  if (
    currentEntitlements.isPaid &&
    (currentEntitlements.status === "active" || currentEntitlements.status === "trialing" || currentEntitlements.status === "past_due")
  ) {
    throw new ForbiddenError("You already have an active Relay subscription. Use the billing portal to manage it.")
  }
  const polar = getPolarClient()
  const repositories = createRepositoryBundle(user.id)

  const checkout = await polar.checkouts.create({
    products: [resolveProductId(parsed.plan, parsed.interval)],
    customerEmail: user.email ?? undefined,
    customerName: user.name ?? undefined,
    externalCustomerId: user.id,
    successUrl: BILLING_SUCCESS_URL,
    returnUrl: BILLING_RETURN_URL,
    metadata: {
      relay_user_id: user.id,
      plan: `${parsed.plan}_${parsed.interval === "year" ? "yearly" : "monthly"}`,
    },
    trialInterval: "day",
    trialIntervalCount: 3,
  })

  await repositories.billingCustomers.upsert({
    userId: user.id,
    externalCustomerId: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
  })

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "billing",
    event: "billing.checkout_created",
    message: "Created a billing checkout session.",
    userId: user.id,
    context: {
      interval: parsed.interval,
      plan: parsed.plan,
      provider: "polar",
    },
  })

  return {
    checkoutUrl: checkout.url,
    checkoutId: checkout.id,
  }
}

export async function resyncBillingStateForUser(userId: string) {
  const polar = getPolarClient()
  // Fetch the authoritative customer state directly from Polar. This is the
  // same payload shape that `customer.state_changed` webhooks deliver, so we
  // can run it through the existing sync path.
  const state = await polar.customers.getStateExternal({ externalId: userId })

  await syncBillingStateFromCustomerState({ data: state as unknown as Record<string, unknown> })

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "billing",
    event: "billing.manual_resync",
    message: "Manually resynced billing state from Polar customer state.",
    userId,
    context: {
      provider: "polar",
    },
  })
}

export async function createPolarPortalForUser(userId: string) {
  const polar = getPolarClient()
  const repositories = createRepositoryBundle(userId)
  const customer = await repositories.billingCustomers.getByUserId(userId)

  if (!customer) {
    throw new Error("No billing customer exists yet for this user.")
  }

  const session = await polar.customerSessions.create({
    externalCustomerId: customer.externalCustomerId,
    returnUrl: BILLING_RETURN_URL,
  })

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "billing",
    event: "billing.portal_created",
    message: "Created a billing portal session.",
    userId,
    context: {
      provider: "polar",
      plan: "pro",
    },
  })

  return {
    portalUrl: session.customerPortalUrl,
  }
}

function normalizeSubscriptionPayload(
  subscription: Record<string, unknown>,
  providerCustomerId: string | null,
): NormalizedSubscriptionInput {
  const productId = deriveProductIdFromSubscription(subscription)
  const normalizedStatus = normalizePolarStatus(subscription.status)
  const currentPeriodStart = coercePolarTimestamp(subscription.currentPeriodStart)
  const currentPeriodEnd = coercePolarTimestamp(subscription.currentPeriodEnd)
  const planFromProduct = derivePlanFromProductId(productId)
  const planFromMetadata = derivePlanFromMetadata(subscription)
  const planKey = planFromProduct !== "free" ? planFromProduct : planFromMetadata
  const interval =
    deriveIntervalFromProductId(productId) ??
    deriveIntervalFromMetadata(subscription) ??
    (subscription.recurringInterval === "year" ? "year" : subscription.recurringInterval === "month" ? "month" : null)
  return {
    providerSubscriptionId: String(subscription.id),
    providerCustomerId,
    productId,
    planKey,
    status: normalizedStatus,
    interval,
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    currentPeriodStart,
    currentPeriodEnd: currentPeriodEnd ?? coercePolarTimestamp(subscription.endsAt),
    trialStartsAt: coercePolarTimestamp(subscription.trialStart),
    trialEndsAt: coercePolarTimestamp(subscription.trialEnd),
    raw: subscription,
  }
}

export async function revokeBillingSubscriptionsForAccountDeletion(userId: string) {
  const repositories = createRepositoryBundle(userId)
  const subscriptions = await repositories.subscriptions.listByUser(userId)
  const activeSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.planKey !== "free" &&
      (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due"),
  )

  if (activeSubscriptions.length === 0) return

  const polar = getPolarClient()
  for (const subscription of activeSubscriptions) {
    try {
      await polar.subscriptions.revoke({ id: subscription.providerSubscriptionId })
    } catch (error) {
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "billing",
        event: "billing.account_delete_revoke_failed",
        message: "Failed to revoke a billing subscription during account deletion.",
        userId,
        context: {
          provider: "polar",
          providerSubscriptionId: subscription.providerSubscriptionId,
          plan: subscription.planKey,
          status: subscription.status,
        },
        error,
      })
      throw new Error("Could not cancel the active billing subscription. Please try again.")
    }
  }
}

async function applyEntitlementAndEmit(opts: {
  userId: string
  providerCustomerId: string | null
  activeSubscription: NormalizedSubscriptionInput | null
  customerEmail: string | null
  customerName: string | null
}) {
  const { userId, providerCustomerId, activeSubscription, customerEmail, customerName } = opts
  const repositories = createRepositoryBundle(userId)

  const previousEntitlement = await repositories.entitlements.getByUserId(userId)

  const entitlement = buildEntitlementRowFromPlan({
    userId,
    plan: activeSubscription ? activeSubscription.planKey : "free",
    status: (activeSubscription?.status ?? "inactive") as BillingSubscriptionStatus,
    interval: activeSubscription?.interval ?? null,
    providerCustomerId,
    providerSubscriptionId: activeSubscription?.providerSubscriptionId ?? null,
    trialEndsAt: activeSubscription?.trialEndsAt ?? null,
    currentPeriodEnd: activeSubscription?.currentPeriodEnd ?? null,
  })

  await repositories.entitlements.upsert(entitlement)

  const transition = detectPlanTransition(
    previousEntitlement
      ? { planKey: previousEntitlement.planKey, status: previousEntitlement.status }
      : null,
    { planKey: entitlement.planKey, status: entitlement.status },
  )

  if (transition !== "none") {
    let recipientEmail = customerEmail
    let recipientName = customerName
    if (!recipientEmail) {
      const customer = await repositories.billingCustomers.getByUserId(userId)
      recipientEmail = customer?.email ?? null
      recipientName = recipientName ?? customer?.name ?? null
    }

    await fireTransitionEmail(transition, {
      email: recipientEmail,
      name: recipientName,
      previous: previousEntitlement
        ? {
            planKey: previousEntitlement.planKey,
            status: previousEntitlement.status,
            interval: previousEntitlement.interval,
            currentPeriodEnd: previousEntitlement.currentPeriodEnd,
          }
        : null,
      next: {
        planKey: entitlement.planKey,
        status: entitlement.status,
        interval: entitlement.interval,
        currentPeriodEnd: entitlement.currentPeriodEnd,
      },
    })

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "billing",
      event: "billing.plan_transition",
      message: "Detected a billing plan transition.",
      userId,
      context: {
        transition,
        from: previousEntitlement
          ? { plan: previousEntitlement.planKey, status: previousEntitlement.status }
          : { plan: "free", status: "inactive" },
        to: { plan: entitlement.planKey, status: entitlement.status },
        provider: "polar",
      },
    })
  }

  return entitlement
}

export async function syncBillingStateFromCustomerState(payload: Record<string, unknown>) {
  const data = (payload.data ?? payload) as Record<string, unknown>
  const externalCustomerId = typeof data.externalId === "string" ? data.externalId : null
  if (!externalCustomerId) {
    throw new Error("Polar customer state payload missing externalId.")
  }

  const repositories = createRepositoryBundle(externalCustomerId)
  const profile = await repositories.profiles.getById(externalCustomerId)
  if (!profile) {
    await logServerEvent({
      level: "warn",
      surface: "web-api",
      area: "billing",
      event: "billing.customer_state_skipped_deleted_user",
      message: "Skipped Polar customer state sync because the Relay profile no longer exists.",
      userId: externalCustomerId,
      context: { provider: "polar", source: "customer.state_changed" },
    })
    return
  }
  const providerCustomerId = typeof data.id === "string" ? data.id : null
  const customerEmail = typeof data.email === "string" ? data.email : null
  const customerName = typeof data.name === "string" ? data.name : null
  const activeSubscriptions = Array.isArray(data.activeSubscriptions)
    ? (data.activeSubscriptions as Array<Record<string, unknown>>)
    : []

  const normalizedSubscriptions = activeSubscriptions.map((subscription) =>
    normalizeSubscriptionPayload(subscription, providerCustomerId),
  )

  await repositories.billingCustomers.upsert({
    userId: externalCustomerId,
    externalCustomerId,
    providerCustomerId,
    email: customerEmail,
    name: customerName,
    trialClaimedAt:
      normalizedSubscriptions.find((subscription) => Boolean(subscription.trialEndsAt))?.trialStartsAt ?? null,
  })

  await repositories.subscriptions.upsertMany(externalCustomerId, normalizedSubscriptions)
  await repositories.subscriptions.markMissingAsCanceled(
    externalCustomerId,
    normalizedSubscriptions.map((subscription) => subscription.providerSubscriptionId),
  )

  const activeSubscription = pickActiveSubscription(normalizedSubscriptions)

  const entitlement = await applyEntitlementAndEmit({
    userId: externalCustomerId,
    providerCustomerId,
    activeSubscription,
    customerEmail,
    customerName,
  })

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "billing",
    event: "billing.subscription_state_synced",
    message: "Synchronized billing state from Polar customer state.",
    userId: externalCustomerId,
    context: {
      plan: entitlement.planKey,
      status: entitlement.status,
      provider: "polar",
      interval: entitlement.interval,
      source: "customer.state_changed",
    },
  })
}

export async function syncBillingStateFromSubscriptionEvent(event: {
  type: string
  data?: Record<string, unknown>
}) {
  const subscription = (event.data ?? {}) as Record<string, unknown>
  const customer = (subscription.customer ?? {}) as Record<string, unknown>
  const externalCustomerId =
    typeof customer.externalId === "string"
      ? customer.externalId
      : typeof subscription.customerExternalId === "string"
        ? subscription.customerExternalId
        : null

  if (!externalCustomerId) {
    await logServerEvent({
      level: "warn",
      surface: "web-api",
      area: "billing",
      event: "billing.subscription_event_missing_external_id",
      message: "Polar subscription event missing customer.externalId — cannot attribute to a user.",
      context: { provider: "polar", type: event.type },
    })
    return
  }

  const providerCustomerId =
    typeof customer.id === "string"
      ? customer.id
      : typeof subscription.customerId === "string"
        ? subscription.customerId
        : null
  const customerEmail = typeof customer.email === "string" ? customer.email : null
  const customerName = typeof customer.name === "string" ? customer.name : null

  const repositories = createRepositoryBundle(externalCustomerId)
  const profile = await repositories.profiles.getById(externalCustomerId)
  if (!profile) {
    await logServerEvent({
      level: "warn",
      surface: "web-api",
      area: "billing",
      event: "billing.subscription_event_skipped_deleted_user",
      message: "Skipped Polar subscription sync because the Relay profile no longer exists.",
      userId: externalCustomerId,
      context: { provider: "polar", type: event.type },
    })
    return
  }
  const normalized = normalizeSubscriptionPayload(subscription, providerCustomerId)

  // Only revocation is immediately terminal. Polar cancellation can mean
  // cancel-at-period-end while the subscription remains active, so trust that
  // payload status and keep paid entitlements active until the period ends.
  if (event.type === "subscription.revoked") {
    normalized.status = "canceled"
  }

  await repositories.billingCustomers.upsert({
    userId: externalCustomerId,
    externalCustomerId,
    providerCustomerId,
    email: customerEmail,
    name: customerName,
    trialClaimedAt: normalized.trialStartsAt ?? null,
  })

  await repositories.subscriptions.upsertMany(externalCustomerId, [normalized])

  // Re-read all subs for the user so entitlement reflects the whole picture,
  // not just this single event.
  const allSubs = await repositories.subscriptions.listByUser(externalCustomerId)
  const activeNormalized: NormalizedSubscriptionInput[] = allSubs.map((row) => ({
    providerSubscriptionId: row.providerSubscriptionId,
    providerCustomerId: row.providerCustomerId,
    productId: row.productId,
    planKey: row.planKey,
    status: row.status,
    interval: row.interval,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    trialStartsAt: row.trialStartsAt,
    trialEndsAt: row.trialEndsAt,
    raw: {},
  }))

  const activeSubscription = pickActiveSubscription(activeNormalized)

  const entitlement = await applyEntitlementAndEmit({
    userId: externalCustomerId,
    providerCustomerId,
    activeSubscription,
    customerEmail,
    customerName,
  })

  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "billing",
    event: "billing.subscription_state_synced",
    message: "Synchronized billing state from Polar subscription event.",
    userId: externalCustomerId,
    context: {
      plan: entitlement.planKey,
      status: entitlement.status,
      provider: "polar",
      interval: entitlement.interval,
      source: event.type,
    },
  })
}

function extractWebhookHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name)
  return value && value.length > 0 ? value : null
}

function sanitizeHeadersForAudit(headers: Headers): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  const allow = new Set([
    "webhook-id",
    "webhook-timestamp",
    "webhook-signature",
    "content-type",
    "content-length",
    "user-agent",
    "x-polar-event",
    "x-polar-delivery",
    "x-forwarded-for",
    "x-vercel-id",
    "host",
  ])
  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (!allow.has(lower)) return
    // Never persist the full signature — keep a short prefix as a diagnostic
    // shape indicator (algorithm + length) without giving away the HMAC.
    if (lower === "webhook-signature") {
      safe[lower] = `${value.slice(0, 16)}… (${value.length} chars)`
      return
    }
    safe[lower] = value
  })
  return safe
}

export async function handlePolarWebhook(rawBody: string, headers: Headers) {
  // 1. Persist a raw delivery audit row FIRST, before any validation. This
  //    gives us a durable trail even when `validateEvent` throws, which was
  //    impossible in the previous implementation and left us completely blind
  //    to why Polar retries were failing.
  const auditRepositories = createRepositoryBundle()
  const polarEventId = extractWebhookHeader(headers, "webhook-id")
  const polarEventType = extractWebhookHeader(headers, "webhook-type")
    ?? extractWebhookHeader(headers, "x-polar-event")
  const sanitizedHeaders = sanitizeHeadersForAudit(headers)
  const bodyHash = rawBody.length > 0 ? hashContent(rawBody) : null

  const rawDelivery = await auditRepositories.billingWebhookRawDeliveries.record({
    polarEventId,
    polarEventType,
    headers: sanitizedHeaders,
    bodyHash,
    bodyLength: rawBody.length,
  })

  const secret = process.env["POLAR_WEBHOOK_SECRET"]
  if (!secret) {
    await auditRepositories.billingWebhookRawDeliveries.markStatus(
      rawDelivery.id,
      "failed",
      "POLAR_WEBHOOK_SECRET is not configured",
    )
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "billing",
      event: "billing.webhook_secret_missing",
      message: "Polar webhook rejected — POLAR_WEBHOOK_SECRET is not configured.",
      context: {
        provider: "polar",
        rawDeliveryId: rawDelivery.id,
      },
    })
    return { ok: false, reason: "secret_missing" as const }
  }

  // 2. Validate signature. Distinguish between signature failures (fix the
  //    secret/URL) and unknown-event-type failures (SDK version skew with
  //    Polar's event catalog — non-fatal, should mark ignored not failed).
  let event: { type: string; data?: Record<string, unknown>; timestamp?: string | Date }
  try {
    event = validateEvent(
      rawBody,
      Object.fromEntries(headers.entries()),
      secret,
    ) as unknown as { type: string; data?: Record<string, unknown>; timestamp?: string | Date }
  } catch (error) {
    const message = error instanceof Error ? error.message : "validateEvent threw a non-Error"

    if (error instanceof WebhookVerificationError) {
      await auditRepositories.billingWebhookRawDeliveries.markStatus(rawDelivery.id, "failed", `signature: ${message}`)
      await logServerEvent({
        level: "error",
        surface: "web-api",
        area: "billing",
        event: "billing.webhook_signature_invalid",
        message: "Polar webhook signature validation failed.",
        context: {
          provider: "polar",
          rawDeliveryId: rawDelivery.id,
          polarEventId,
          polarEventType,
        },
        error,
      })
      return { ok: false, reason: "signature_invalid" as const }
    }

    if (error instanceof SDKValidationError) {
      // SDK doesn't recognise this event type — payload is still trusted
      // (signature passed), we just can't parse it. Record and move on.
      await auditRepositories.billingWebhookRawDeliveries.markStatus(rawDelivery.id, "ignored", `unknown_event: ${message}`)
      await logServerEvent({
        level: "warn",
        surface: "web-api",
        area: "billing",
        event: "billing.webhook_unknown_event",
        message: "Polar webhook event type not recognised by installed SDK version.",
        context: {
          provider: "polar",
          rawDeliveryId: rawDelivery.id,
          polarEventId,
          polarEventType,
        },
      })
      return { ok: true, reason: "unknown_event" as const }
    }

    await auditRepositories.billingWebhookRawDeliveries.markStatus(rawDelivery.id, "failed", `validate_event: ${message}`)
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "billing",
      event: "billing.webhook_validate_threw",
      message: "Polar webhook validateEvent threw unexpectedly.",
      context: {
        provider: "polar",
        rawDeliveryId: rawDelivery.id,
        polarEventId,
        polarEventType,
      },
      error,
    })
    return { ok: false, reason: "validate_threw" as const }
  }

  // 3. Mark the raw delivery as verified — signature is good, we know the
  //    event type, we trust the payload.
  await auditRepositories.billingWebhookRawDeliveries.markStatus(rawDelivery.id, "verified")

  // 4. Deduplicate processing via the existing billing_webhook_events table.
  const repositories = createRepositoryBundle()
  const eventId = hashContent(rawBody)

  const { created, record } = await repositories.billingWebhookEvents.createIfAbsent({
    providerEventId: eventId,
    eventType: event.type,
    payload: event as unknown as Record<string, unknown>,
  })

  if (!created && record.status === "processed") {
    await auditRepositories.billingWebhookRawDeliveries.markStatus(rawDelivery.id, "processed", "duplicate")
    return { ok: true, duplicate: true }
  }

  try {
    await dispatchPolarEvent(event)
    await repositories.billingWebhookEvents.markProcessed(record.id)
    await auditRepositories.billingWebhookRawDeliveries.markStatus(rawDelivery.id, "processed")

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "billing",
      event: "billing.webhook_processed",
      message: "Processed a Polar billing webhook.",
      context: {
        provider: "polar",
        type: event.type,
        rawDeliveryId: rawDelivery.id,
      },
    })

    return { ok: true, duplicate: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed"
    await repositories.billingWebhookEvents.markFailed(record.id, message)
    await auditRepositories.billingWebhookRawDeliveries.markStatus(rawDelivery.id, "failed", `handler: ${message}`)

    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "billing",
      event: "billing.webhook_failed",
      message: "Failed to process a Polar billing webhook.",
      context: {
        provider: "polar",
        type: event.type,
        rawDeliveryId: rawDelivery.id,
      },
      error,
    })

    throw error
  }
}

async function dispatchPolarEvent(event: { type: string; data?: Record<string, unknown> }) {
  // `customer.state_changed` is the authoritative full-state event; keep it as
  // the primary source of truth. Subscription-level events are handled in
  // Phase 1 via syncBillingStateFromSubscriptionEvent.
  if (event.type === "customer.state_changed") {
    await syncBillingStateFromCustomerState(event as unknown as Record<string, unknown>)
    return
  }

  if (
    event.type === "subscription.created" ||
    event.type === "subscription.active" ||
    event.type === "subscription.updated" ||
    event.type === "subscription.uncanceled" ||
    event.type === "subscription.canceled" ||
    event.type === "subscription.revoked" ||
    event.type === "subscription.past_due"
  ) {
    await syncBillingStateFromSubscriptionEvent(event)
    return
  }

  // order.paid, checkout.*, organization.updated, etc. are recorded for audit
  // but do not require a DB mutation — subscription/customer events are the
  // source of truth.
}
