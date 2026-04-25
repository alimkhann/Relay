import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createRepositoryBundle: vi.fn(),
  sendSubscriptionCanceledEmail: vi.fn(),
  sendTrialStartedEmail: vi.fn(),
  sendWelcomeToProEmail: vi.fn(),
  logServerEvent: vi.fn(),
}))

vi.mock("@relay/db", () => ({
  createRepositoryBundle: mocks.createRepositoryBundle,
}))

vi.mock("./email-service", () => ({
  sendSubscriptionCanceledEmail: mocks.sendSubscriptionCanceledEmail,
  sendTrialStartedEmail: mocks.sendTrialStartedEmail,
  sendWelcomeToProEmail: mocks.sendWelcomeToProEmail,
}))

vi.mock("@/server/logging/logger", () => ({
  logServerEvent: mocks.logServerEvent,
}))

type PlanKey = "free" | "starter" | "pro"
type Status = "inactive" | "trialing" | "active" | "past_due" | "canceled"
type Interval = "month" | "year" | null

function stubProductEnv() {
  vi.stubEnv("POLAR_PRODUCT_ID_STARTER_MONTHLY", "prod_starter_monthly")
  vi.stubEnv("POLAR_PRODUCT_ID_STARTER_ANNUAL", "prod_starter_annual")
  vi.stubEnv("POLAR_PRODUCT_ID_PRO_MONTHLY", "prod_pro_monthly")
  vi.stubEnv("POLAR_PRODUCT_ID_PRO_ANNUAL", "prod_pro_annual")
}

function entitlement(input: {
  planKey: PlanKey
  status: Status
  interval?: Interval
  currentPeriodEnd?: string | null
  providerSubscriptionId?: string | null
}) {
  return {
    userId: "user_1",
    planKey: input.planKey,
    status: input.status,
    providerCustomerId: "cus_1",
    providerSubscriptionId: input.providerSubscriptionId ?? null,
    interval: input.interval ?? null,
    activeProjectsLimit: 0,
    historyRetentionDays: 0,
    captureLimitMonthly: 0,
    mcpReadLimitDaily: 0,
    mcpWriteLimitDaily: 0,
    handoffEnabled: input.planKey !== "free",
    trialEndsAt: null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    updatedAt: "2026-04-25T00:00:00.000Z",
  }
}

function createRepositories(previousEntitlement: ReturnType<typeof entitlement> | null) {
  const subscriptions: Array<Record<string, unknown>> = []
  const repositories = {
    billingCustomers: {
      getByUserId: vi.fn(async () => ({
        email: "alim@example.com",
        name: "Alim",
      })),
      upsert: vi.fn(async () => null),
    },
    profiles: {
      getById: vi.fn(async () => ({
        id: "user_1",
        email: "alim@example.com",
        displayName: "Alim",
        avatarUrl: null,
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:00.000Z",
      })),
    },
    entitlements: {
      getByUserId: vi.fn(async () => previousEntitlement),
      upsert: vi.fn(async (row) => row),
    },
    subscriptions: {
      upsertMany: vi.fn(async (userId: string, rows: Array<Record<string, unknown>>) => {
        for (const row of rows) {
          const existingIndex = subscriptions.findIndex(
            (subscription) => subscription["providerSubscriptionId"] === row["providerSubscriptionId"],
          )
          const next = {
            id: row["providerSubscriptionId"],
            userId,
            provider: "polar",
            ...row,
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:00.000Z",
          }
          if (existingIndex >= 0) {
            subscriptions[existingIndex] = next
          } else {
            subscriptions.push(next)
          }
        }
      }),
      listByUser: vi.fn(async () => subscriptions),
      markMissingAsCanceled: vi.fn(async () => null),
    },
  }
  mocks.createRepositoryBundle.mockReturnValue(repositories)
  return repositories
}

async function loadBillingService() {
  vi.resetModules()
  stubProductEnv()
  return import("./billing-service")
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("billing webhook sync", () => {
  it("keeps cancel-at-period-end subscriptions paid and does not send contradictory emails", async () => {
    const repositories = createRepositories(entitlement({
      planKey: "starter",
      status: "active",
      interval: "month",
      currentPeriodEnd: "2026-05-25T00:00:00.000Z",
      providerSubscriptionId: "sub_starter",
    }))
    const { syncBillingStateFromSubscriptionEvent } = await loadBillingService()

    await syncBillingStateFromSubscriptionEvent({
      type: "subscription.canceled",
      data: {
        id: "sub_starter",
        status: "active",
        productId: "prod_starter_monthly",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2026-05-25T00:00:00.000Z"),
        customer: {
          id: "cus_1",
          externalId: "user_1",
          email: "alim@example.com",
          name: "Alim",
        },
      },
    })

    expect(repositories.entitlements.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        planKey: "starter",
        status: "active",
        interval: "month",
        currentPeriodEnd: "2026-05-25T00:00:00.000Z",
      }),
    )
    expect(mocks.sendSubscriptionCanceledEmail).not.toHaveBeenCalled()
    expect(mocks.sendWelcomeToProEmail).not.toHaveBeenCalled()
  })

  it("sends welcome email with the new paid plan, not the previous free plan", async () => {
    createRepositories(entitlement({ planKey: "free", status: "inactive" }))
    const { syncBillingStateFromSubscriptionEvent } = await loadBillingService()

    await syncBillingStateFromSubscriptionEvent({
      type: "subscription.active",
      data: {
        id: "sub_pro",
        status: "active",
        productId: "prod_pro_monthly",
        currentPeriodEnd: "2026-05-25T00:00:00.000Z",
        customer: {
          id: "cus_1",
          externalId: "user_1",
          email: "alim@example.com",
          name: "Alim",
        },
      },
    })

    expect(mocks.sendWelcomeToProEmail).toHaveBeenCalledWith(
      "alim@example.com",
      expect.objectContaining({
        plan: "Pro",
        interval: "month",
      }),
    )
  })

  it("downgrades revoked subscriptions and sends cancellation with the previous paid plan", async () => {
    const repositories = createRepositories(entitlement({
      planKey: "starter",
      status: "active",
      interval: "year",
      currentPeriodEnd: "2027-04-25T00:00:00.000Z",
      providerSubscriptionId: "sub_starter",
    }))
    const { syncBillingStateFromSubscriptionEvent } = await loadBillingService()

    await syncBillingStateFromSubscriptionEvent({
      type: "subscription.revoked",
      data: {
        id: "sub_starter",
        status: "active",
        productId: "prod_starter_annual",
        currentPeriodEnd: "2027-04-25T00:00:00.000Z",
        customer: {
          id: "cus_1",
          externalId: "user_1",
          email: "alim@example.com",
          name: "Alim",
        },
      },
    })

    expect(repositories.entitlements.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        planKey: "free",
        status: "inactive",
        interval: null,
      }),
    )
    expect(mocks.sendSubscriptionCanceledEmail).toHaveBeenCalledWith(
      "alim@example.com",
      expect.objectContaining({
        plan: "Starter",
        currentPeriodEnd: "2027-04-25T00:00:00.000Z",
      }),
    )
    expect(mocks.sendWelcomeToProEmail).not.toHaveBeenCalled()
  })

  it("prefers the highest active subscription and preserves annual interval", async () => {
    const repositories = createRepositories(entitlement({ planKey: "starter", status: "active", interval: "month" }))
    const { syncBillingStateFromCustomerState } = await loadBillingService()

    await syncBillingStateFromCustomerState({
      data: {
        id: "cus_1",
        externalId: "user_1",
        email: "alim@example.com",
        name: "Alim",
        activeSubscriptions: [
          {
            id: "sub_starter",
            status: "active",
            productId: "prod_starter_monthly",
            currentPeriodEnd: "2026-05-25T00:00:00.000Z",
          },
          {
            id: "sub_pro",
            status: "active",
            productId: "prod_pro_annual",
            currentPeriodEnd: "2027-04-25T00:00:00.000Z",
          },
        ],
      },
    })

    expect(repositories.entitlements.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        planKey: "pro",
        status: "active",
        interval: "year",
        providerSubscriptionId: "sub_pro",
      }),
    )
  })

  it("derives starter plan when Polar nests product id under product object", async () => {
    const repositories = createRepositories(entitlement({ planKey: "free", status: "inactive" }))
    const { syncBillingStateFromCustomerState } = await loadBillingService()

    await syncBillingStateFromCustomerState({
      data: {
        id: "cus_1",
        externalId: "user_1",
        email: "alim@example.com",
        name: "Alim",
        activeSubscriptions: [
          {
            id: "sub_starter",
            status: "active",
            product: {
              id: "prod_starter_monthly",
            },
            currentPeriodEnd: "2026-05-25T00:00:00.000Z",
          },
        ],
      },
    })

    expect(repositories.entitlements.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        planKey: "starter",
        status: "active",
        interval: "month",
        providerSubscriptionId: "sub_starter",
      }),
    )
  })

  it("derives starter plan from subscriptions fallback payload and product name", async () => {
    const repositories = createRepositories(entitlement({ planKey: "free", status: "inactive" }))
    const { syncBillingStateFromCustomerState } = await loadBillingService()

    await syncBillingStateFromCustomerState({
      data: {
        id: "cus_1",
        externalId: "user_1",
        email: "alim@example.com",
        name: "Alim",
        subscriptions: [
          {
            id: "sub_starter_name_only",
            status: "active",
            recurringInterval: "month",
            product: {
              name: "Relay Starter Monthly",
            },
            currentPeriodEnd: "2026-05-25T00:00:00.000Z",
          },
        ],
      },
    })

    expect(repositories.entitlements.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        planKey: "starter",
        status: "active",
        interval: "month",
        providerSubscriptionId: "sub_starter_name_only",
      }),
    )
  })
})
