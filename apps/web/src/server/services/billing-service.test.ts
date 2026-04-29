import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createRepositoryBundle: vi.fn(),
  polarCustomerSessionsCreate: vi.fn(),
  polarCheckoutsCreate: vi.fn(),
  polarDiscountsCreate: vi.fn(),
  polarSubscriptionsRevoke: vi.fn(),
  polarSubscriptionsUpdate: vi.fn(),
  sendSubscriptionCanceledEmail: vi.fn(),
  sendTrialStartedEmail: vi.fn(),
  sendWelcomeToProEmail: vi.fn(),
  logServerEvent: vi.fn(),
}))

vi.mock("@polar-sh/sdk", () => ({
  Polar: vi.fn(() => ({
    customerSessions: {
      create: mocks.polarCustomerSessionsCreate,
    },
    checkouts: {
      create: mocks.polarCheckoutsCreate,
    },
    discounts: {
      create: mocks.polarDiscountsCreate,
    },
    subscriptions: {
      revoke: mocks.polarSubscriptionsRevoke,
      update: mocks.polarSubscriptionsUpdate,
    },
  })),
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
        providerCustomerId: "cus_1",
        externalCustomerId: "user_1",
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
      getByEmail: vi.fn(async () => ({
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
    referralCodes: {
      getByUserId: vi.fn(async () => null),
      getByCode: vi.fn(async () => null),
      create: vi.fn(async () => null),
    },
    referrals: {
      getByRefereeId: vi.fn(async () => null),
      markPaid: vi.fn(async () => null),
      markQualified: vi.fn(async () => null),
      countQualifiedByReferrerSince: vi.fn(async () => 0),
      rejectBySubscription: vi.fn(async () => null),
    },
    referralRewards: {
      getByReferralId: vi.fn(async () => null),
      create: vi.fn(async () => null),
      markApplied: vi.fn(async () => null),
      listByUserId: vi.fn(async () => []),
    },
  }
  mocks.createRepositoryBundle.mockReturnValue(repositories)
  return repositories
}

function referralFixture() {
  return {
    id: "ref_1",
    referrerId: "referrer_1",
    refereeId: "user_1",
    referralCodeId: "code_1",
    refereeEmail: "alim@example.com",
    status: "activated" as const,
    planKey: null,
    interval: null,
    providerSubscriptionId: null,
    paidInvoiceCount: 0,
    firstPaidAt: null,
    lastPaidPeriodStart: null,
    activatedAt: "2026-04-25T00:00:00.000Z",
    qualifiedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: "2026-04-25T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
  }
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
  it("keeps the default 3-day trial and applies the referee first-period discount at checkout", async () => {
    const repositories = createRepositories(entitlement({ planKey: "free", status: "inactive" }))
    repositories.referrals.getByRefereeId.mockResolvedValueOnce(referralFixture() as never)
    mocks.polarDiscountsCreate.mockResolvedValueOnce({ id: "disc_referee" })
    mocks.polarCheckoutsCreate.mockResolvedValueOnce({ id: "checkout_1", url: "https://checkout.test" })
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_token")
    const { createPolarCheckoutForUser } = await loadBillingService()

    await expect(
      createPolarCheckoutForUser(
        { id: "user_1", email: "alim@example.com", name: "Alim" },
        { plan: "starter", interval: "month", referralCode: "ignored-by-service" },
      ),
    ).resolves.toEqual({ checkoutId: "checkout_1", checkoutUrl: "https://checkout.test" })

    expect(mocks.polarDiscountsCreate).toHaveBeenCalledWith(expect.objectContaining({
      duration: "once",
      type: "percentage",
      basisPoints: 2000,
      maxRedemptions: 1,
      products: ["prod_starter_monthly"],
    }))
    expect(mocks.polarCheckoutsCreate).toHaveBeenCalledWith(expect.objectContaining({
      discountId: "disc_referee",
      allowDiscountCodes: false,
      trialInterval: "day",
      trialIntervalCount: 3,
    }))
  })

  it("records monthly referrals without qualifying them until the second paid invoice", async () => {
    const repositories = createRepositories(entitlement({ planKey: "free", status: "inactive" }))
    repositories.referrals.getByRefereeId.mockResolvedValueOnce(referralFixture() as never)
    ;(repositories.referrals.markPaid as any).mockImplementationOnce(async (input: {
      id: string
      planKey: PlanKey
      interval: Interval
      providerSubscriptionId: string
      paidInvoiceCount: number
      firstPaidAt: string
      lastPaidPeriodStart: string | null
    }) => ({
      id: input.id,
      referrerId: "referrer_1",
      refereeId: "user_1",
      referralCodeId: "code_1",
      refereeEmail: "alim@example.com",
      status: "paid",
      planKey: input.planKey,
      interval: input.interval,
      providerSubscriptionId: input.providerSubscriptionId,
      paidInvoiceCount: input.paidInvoiceCount,
      firstPaidAt: input.firstPaidAt,
      lastPaidPeriodStart: input.lastPaidPeriodStart,
      activatedAt: "2026-04-25T00:00:00.000Z",
      qualifiedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
    }) as never)
    const { syncBillingStateFromSubscriptionEvent } = await loadBillingService()

    await syncBillingStateFromSubscriptionEvent({
      type: "subscription.active",
      data: {
        id: "sub_starter",
        status: "active",
        productId: "prod_starter_monthly",
        currentPeriodStart: "2026-05-01T00:00:00.000Z",
        currentPeriodEnd: "2026-06-01T00:00:00.000Z",
        metadata: { relay_user_id: "user_1", plan: "starter_monthly" },
        customer: { id: "cus_1", externalId: "user_1", email: "alim@example.com", name: "Alim" },
      },
    })

    expect(repositories.referrals.markPaid).toHaveBeenCalledWith(expect.objectContaining({
      paidInvoiceCount: 1,
      providerSubscriptionId: "sub_starter",
      planKey: "starter",
      interval: "month",
    }))
    expect(repositories.referrals.markQualified).not.toHaveBeenCalled()
    expect(repositories.referralRewards.create).not.toHaveBeenCalled()
  })

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

  it("parses snake_case customer state payload fields", async () => {
    const repositories = createRepositories(entitlement({ planKey: "free", status: "inactive" }))
    const { syncBillingStateFromCustomerState } = await loadBillingService()

    await syncBillingStateFromCustomerState({
      data: {
        id: "cus_1",
        external_id: "user_1",
        email: "alim@example.com",
        name: "Alim",
        active_subscriptions: [
          {
            id: "sub_starter_snake",
            status: "active",
            product_id: "prod_starter_monthly",
            recurring_interval: "month",
            cancel_at_period_end: false,
            current_period_end: "2026-05-25T00:00:00.000Z",
          },
        ],
      },
    })

    expect(repositories.entitlements.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        planKey: "starter",
        status: "active",
        interval: "month",
        providerSubscriptionId: "sub_starter_snake",
      }),
    )
  })

  it("prefers checkout metadata user id over a stale Polar customer external id", async () => {
    const repositories = createRepositories(entitlement({ planKey: "free", status: "inactive" }))
    const { syncBillingStateFromSubscriptionEvent } = await loadBillingService()

    await syncBillingStateFromSubscriptionEvent({
      type: "subscription.active",
      data: {
        id: "sub_starter_metadata",
        status: "trialing",
        productId: "prod_starter_monthly",
        metadata: {
          relay_user_id: "user_1",
          plan: "starter_monthly",
        },
        currentPeriodEnd: "2026-05-25T00:00:00.000Z",
        customer: {
          id: "cus_1",
          externalId: "stale_user",
          email: "alim@example.com",
          name: "Alim",
        },
      },
    })

    expect(repositories.billingCustomers.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        externalCustomerId: "user_1",
        providerCustomerId: "cus_1",
      }),
    )
    expect(repositories.entitlements.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        planKey: "starter",
        status: "trialing",
      }),
    )
  })

  it("uses subscription metadata inside customer state when Polar reuses an old customer", async () => {
    const repositories = createRepositories(entitlement({ planKey: "free", status: "inactive" }))
    const { syncBillingStateFromCustomerState } = await loadBillingService()

    await syncBillingStateFromCustomerState({
      data: {
        id: "cus_1",
        externalId: "stale_user",
        email: "alim@example.com",
        name: "Alim",
        activeSubscriptions: [
          {
            id: "sub_starter_customer_state",
            status: "active",
            productId: "prod_starter_monthly",
            metadata: {
              relay_user_id: "user_1",
              plan: "starter_monthly",
            },
            currentPeriodEnd: "2026-05-25T00:00:00.000Z",
          },
        ],
      },
    })

    expect(repositories.subscriptions.upsertMany).toHaveBeenCalledWith(
      "user_1",
      expect.arrayContaining([
        expect.objectContaining({
          providerSubscriptionId: "sub_starter_customer_state",
          planKey: "starter",
        }),
      ]),
    )
    expect(repositories.entitlements.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        planKey: "starter",
        status: "active",
      }),
    )
  })

  it("creates portal sessions with the stored Polar customer id", async () => {
    createRepositories(entitlement({ planKey: "starter", status: "trialing", interval: "month" }))
    mocks.polarCustomerSessionsCreate.mockResolvedValueOnce({
      customerPortalUrl: "https://polar.sh/acme/portal/session",
    })
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_token")
    const { createPolarPortalForUser } = await loadBillingService()

    await expect(createPolarPortalForUser("user_1")).resolves.toEqual({
      portalUrl: "https://polar.sh/acme/portal/session",
    })

    expect(mocks.polarCustomerSessionsCreate).toHaveBeenCalledWith({
      customerId: "cus_1",
      returnUrl: expect.any(String),
    })
  })

  it("falls back to external customer id if Polar rejects the stored customer id", async () => {
    createRepositories(entitlement({ planKey: "starter", status: "trialing", interval: "month" }))
    const notFound = new Error("ResourceNotFound")
    notFound.name = "ResourceNotFound"
    mocks.polarCustomerSessionsCreate
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce({
        customerPortalUrl: "https://polar.sh/acme/portal/session",
      })
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_token")
    const { createPolarPortalForUser } = await loadBillingService()

    await expect(createPolarPortalForUser("user_1")).resolves.toEqual({
      portalUrl: "https://polar.sh/acme/portal/session",
    })

    expect(mocks.polarCustomerSessionsCreate).toHaveBeenNthCalledWith(1, {
      customerId: "cus_1",
      returnUrl: expect.any(String),
    })
    expect(mocks.polarCustomerSessionsCreate).toHaveBeenNthCalledWith(2, {
      externalCustomerId: "user_1",
      returnUrl: expect.any(String),
    })
  })

  it("revokes active paid subscriptions during account deletion", async () => {
    const repositories = createRepositories(entitlement({ planKey: "starter", status: "active", interval: "month" }))
    repositories.subscriptions.listByUser.mockResolvedValueOnce([
      {
        providerSubscriptionId: "sub_starter",
        planKey: "starter",
        status: "active",
      },
    ])
    mocks.polarSubscriptionsRevoke.mockResolvedValueOnce({})
    vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_token")
    const { revokeBillingSubscriptionsForAccountDeletion } = await loadBillingService()

    await revokeBillingSubscriptionsForAccountDeletion("user_1")

    expect(mocks.polarSubscriptionsRevoke).toHaveBeenCalledWith({ id: "sub_starter" })
  })
})
