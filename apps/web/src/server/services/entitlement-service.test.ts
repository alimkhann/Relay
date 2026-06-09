import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createRepositoryBundle: vi.fn(),
  logServerEvent: vi.fn()
}))

vi.mock("@relay/db", () => ({
  createRepositoryBundle: mocks.createRepositoryBundle
}))

vi.mock("@/server/logging/logger", () => ({
  logServerEvent: mocks.logServerEvent
}))

import { TooManyRequestsError } from "@/server/http/errors"

import { assertAssistantTokenBudget, consumeActionQuota } from "./entitlement-service"

function bundle(planKey: string | null, monthTokenCount: number) {
  return {
    entitlements: {
      getByUserId: vi.fn(async () =>
        planKey === null
          ? null
          : {
              planKey,
              status: "active",
              interval: "month",
              handoffEnabled: planKey !== "free",
              trialEndsAt: null,
              currentPeriodEnd: null
            }
      )
    },
    usageCounters: {
      get: vi.fn(async () => ({ count: monthTokenCount })),
      incrementWithinLimits: vi.fn(),
    }
  }
}

describe("assertAssistantTokenBudget", () => {
  beforeEach(() => {
    mocks.createRepositoryBundle.mockReset()
  })

  it("throws TooManyRequestsError once the monthly token cap is reached (free = 50k)", async () => {
    mocks.createRepositoryBundle.mockReturnValue(bundle(null, 50_000))
    await expect(assertAssistantTokenBudget("u1")).rejects.toBeInstanceOf(TooManyRequestsError)
    await expect(assertAssistantTokenBudget("u1")).rejects.toMatchObject({
      plan: "free",
      remaining: 0,
      upgradeUrl: expect.stringContaining("billing")
    })
  })

  it("does not throw while under the cap", async () => {
    mocks.createRepositoryBundle.mockReturnValue(bundle("free", 49_999))
    await expect(assertAssistantTokenBudget("u1")).resolves.toBeUndefined()
  })

  it("uses the plan's higher cap for paid users", async () => {
    // pro monthly token cap is 2,000,000 — well above this usage.
    mocks.createRepositoryBundle.mockReturnValue(bundle("pro", 60_001))
    await expect(assertAssistantTokenBudget("u1")).resolves.toBeUndefined()
  })
})

describe("consumeActionQuota", () => {
  it("consumes daily and monthly action windows atomically", async () => {
    const repositories = bundle("free", 0)
    repositories.usageCounters.incrementWithinLimits.mockResolvedValue([
      { count: 2, windowKey: "day" },
      { count: 7, windowKey: "month" },
    ])
    mocks.createRepositoryBundle.mockReturnValue(repositories)

    await expect(consumeActionQuota("u1", "read", 2)).resolves.toMatchObject({
      family: "read",
      daily: { used: 2, limit: 15 },
      monthly: { used: 7, limit: 60 },
    })
    expect(repositories.usageCounters.incrementWithinLimits).toHaveBeenCalledOnce()
  })

  it("offers Starter to free users and only a reset time to Pro users", async () => {
    const free = bundle("free", 0)
    free.usageCounters.incrementWithinLimits.mockResolvedValue(null)
    mocks.createRepositoryBundle.mockReturnValue(free)
    await expect(consumeActionQuota("u1", "write")).rejects.toMatchObject({
      plan: "free",
      quotaFamily: "write",
      nextPlan: "starter",
      upgradeUrl: expect.stringContaining("billing"),
      resetAt: expect.any(String),
    })

    const pro = bundle("pro", 0)
    pro.usageCounters.incrementWithinLimits.mockResolvedValue(null)
    mocks.createRepositoryBundle.mockReturnValue(pro)
    await expect(consumeActionQuota("u1", "write")).rejects.toMatchObject({
      plan: "pro",
      quotaFamily: "write",
      nextPlan: null,
      upgradeUrl: undefined,
      resetAt: expect.any(String),
    })
  })
})
