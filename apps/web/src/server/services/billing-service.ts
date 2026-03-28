import type { BillingSubscriptionStatus } from "@relay/shared"
import { Polar } from "@polar-sh/sdk"
import { validateEvent } from "@polar-sh/sdk/webhooks"
import { createRepositoryBundle } from "@relay/db"
import { billingCheckoutSchema, hashContent } from "@relay/shared"

import { BILLING_RETURN_URL, BILLING_SUCCESS_URL, PLAN_PRODUCT_IDS } from "./billing-config"
import { buildEntitlementRowFromPlan, resolveViewerEntitlements } from "./entitlement-service"
import { ForbiddenError } from "@/server/http/errors"
import { logServerEvent } from "@/server/logging/logger"

function getPolarClient() {
  const accessToken = process.env["POLAR_ACCESS_TOKEN"]
  if (!accessToken) {
    throw new Error("POLAR_ACCESS_TOKEN is not configured.")
  }

  const server = process.env["POLAR_SANDBOX"] === "true" ? "sandbox" : "production"
  return new Polar({ accessToken, server })
}

function resolveProductId(interval: "month" | "year") {
  const productId = interval === "year" ? PLAN_PRODUCT_IDS.pro.year : PLAN_PRODUCT_IDS.pro.month
  if (!productId) {
    throw new Error(`Polar product ID for ${interval}ly Pro is not configured.`)
  }
  return productId
}

function derivePlanFromProductId(productId: string | null | undefined) {
  if (!productId) return "free" as const
  if (productId === PLAN_PRODUCT_IDS.pro.month || productId === PLAN_PRODUCT_IDS.pro.year) {
    return "pro" as const
  }
  return "free" as const
}

function deriveIntervalFromProductId(productId: string | null | undefined) {
  if (productId === PLAN_PRODUCT_IDS.pro.year) return "year" as const
  if (productId === PLAN_PRODUCT_IDS.pro.month) return "month" as const
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
    currentEntitlements.isPro &&
    (currentEntitlements.status === "active" || currentEntitlements.status === "trialing" || currentEntitlements.status === "past_due")
  ) {
    throw new ForbiddenError("You already have an active Relay Pro subscription. Use the billing portal to manage it.")
  }
  const polar = getPolarClient()
  const repositories = createRepositoryBundle(user.id)

  const checkout = await polar.checkouts.create({
    products: [resolveProductId(parsed.interval)],
    customerEmail: user.email ?? undefined,
    customerName: user.name ?? undefined,
    externalCustomerId: user.id,
    successUrl: BILLING_SUCCESS_URL,
    returnUrl: BILLING_RETURN_URL,
    metadata: {
      relay_user_id: user.id,
      plan: parsed.interval === "year" ? "pro_yearly" : "pro_monthly",
    },
    trialInterval: "day",
    trialIntervalCount: 7,
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
      plan: "pro",
      provider: "polar",
    },
  })

  return {
    checkoutUrl: checkout.url,
    checkoutId: checkout.id,
  }
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

export async function syncBillingStateFromCustomerState(payload: Record<string, unknown>) {
  const data = (payload.data ?? payload) as Record<string, unknown>
  const externalCustomerId = typeof data.externalId === "string" ? data.externalId : null
  if (!externalCustomerId) {
    throw new Error("Polar customer state payload missing externalId.")
  }

  const repositories = createRepositoryBundle(externalCustomerId)
  const activeSubscriptions = Array.isArray(data.activeSubscriptions)
    ? (data.activeSubscriptions as Array<Record<string, unknown>>)
    : []

  const normalizedSubscriptions = activeSubscriptions.map((subscription) => {
    const productId = typeof subscription.productId === "string" ? subscription.productId : null
    const status = typeof subscription.status === "string" ? subscription.status : "active"
    const trialEnd = typeof subscription.trialEnd === "string" ? subscription.trialEnd : null
    const normalizedStatus: BillingSubscriptionStatus =
      status === "trialing"
        ? "trialing"
        : status === "active"
          ? "active"
          : status === "past_due"
            ? "past_due"
            : status === "canceled"
              ? "canceled"
              : "inactive"
    return {
      providerSubscriptionId: String(subscription.id),
      providerCustomerId: typeof data.id === "string" ? data.id : null,
      productId,
      planKey: derivePlanFromProductId(productId),
      status: normalizedStatus,
      interval: deriveIntervalFromProductId(productId),
      cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
      currentPeriodStart: typeof subscription.currentPeriodStart === "string" ? subscription.currentPeriodStart : null,
      currentPeriodEnd: typeof subscription.currentPeriodEnd === "string" ? subscription.currentPeriodEnd : null,
      trialStartsAt: typeof subscription.trialStart === "string" ? subscription.trialStart : null,
      trialEndsAt: trialEnd,
      raw: subscription,
    }
  })

  await repositories.billingCustomers.upsert({
    userId: externalCustomerId,
    externalCustomerId,
    providerCustomerId: typeof data.id === "string" ? data.id : null,
    email: typeof data.email === "string" ? data.email : null,
    name: typeof data.name === "string" ? data.name : null,
    trialClaimedAt: normalizedSubscriptions.find((subscription) => Boolean(subscription.trialEndsAt))?.trialStartsAt ?? null,
  })

  await repositories.subscriptions.upsertMany(externalCustomerId, normalizedSubscriptions)
  await repositories.subscriptions.markMissingAsCanceled(
    externalCustomerId,
    normalizedSubscriptions.map((subscription) => subscription.providerSubscriptionId),
  )

  const proSubscription = normalizedSubscriptions.find(
    (subscription) =>
      subscription.planKey === "pro" &&
      (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due"),
  )

  const entitlement = buildEntitlementRowFromPlan({
    userId: externalCustomerId,
    plan: proSubscription ? "pro" : "free",
    status: (proSubscription?.status ?? "inactive") as BillingSubscriptionStatus,
    interval: proSubscription?.interval ?? null,
    providerCustomerId: typeof data.id === "string" ? data.id : null,
    providerSubscriptionId: proSubscription?.providerSubscriptionId ?? null,
    trialEndsAt: proSubscription?.trialEndsAt ?? null,
    currentPeriodEnd: proSubscription?.currentPeriodEnd ?? null,
  })

  await repositories.entitlements.upsert(entitlement)

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
    },
  })
}

export async function handlePolarWebhook(rawBody: string, headers: Headers) {
  const secret = process.env["POLAR_WEBHOOK_SECRET"]
  if (!secret) {
    throw new Error("POLAR_WEBHOOK_SECRET is not configured.")
  }

  const event = validateEvent(
    rawBody,
    Object.fromEntries(headers.entries()),
    secret,
  ) as unknown as { type: string; data?: Record<string, unknown>; timestamp?: string | Date }
  const repositories = createRepositoryBundle()
  const eventId = hashContent(rawBody)

  const { created, record } = await repositories.billingWebhookEvents.createIfAbsent({
    providerEventId: eventId,
    eventType: event.type,
    payload: event as unknown as Record<string, unknown>,
  })

  if (!created && record.status === "processed") {
    return { ok: true, duplicate: true }
  }

  try {
    if (event.type === "customer.state_changed") {
      await syncBillingStateFromCustomerState(event as unknown as Record<string, unknown>)
    }
    await repositories.billingWebhookEvents.markProcessed(record.id)

    await logServerEvent({
      level: "info",
      surface: "web-api",
      area: "billing",
      event: "billing.webhook_processed",
      message: "Processed a Polar billing webhook.",
      context: {
        provider: "polar",
        type: event.type,
      },
    })

    return { ok: true, duplicate: false }
  } catch (error) {
    await repositories.billingWebhookEvents.markFailed(record.id, error instanceof Error ? error.message : "Webhook processing failed")

    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "billing",
      event: "billing.webhook_failed",
      message: "Failed to process a Polar billing webhook.",
      context: {
        provider: "polar",
        type: event.type,
      },
      error,
    })

    throw error
  }
}
