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

import { assertAssistantTokenBudget } from "./entitlement-service"

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
      get: vi.fn(async () => ({ count: monthTokenCount }))
    }
  }
}

describe("assertAssistantTokenBudget", () => {
  beforeEach(() => {
    mocks.createRepositoryBundle.mockReset()
  })

  it("throws TooManyRequestsError once the monthly token cap is reached (free = 60k)", async () => {
    mocks.createRepositoryBundle.mockReturnValue(bundle(null, 60_000))
    await expect(assertAssistantTokenBudget("u1")).rejects.toBeInstanceOf(TooManyRequestsError)
    await expect(assertAssistantTokenBudget("u1")).rejects.toMatchObject({
      plan: "free",
      remaining: 0,
      upgradeUrl: expect.stringContaining("billing")
    })
  })

  it("does not throw while under the cap", async () => {
    mocks.createRepositoryBundle.mockReturnValue(bundle("free", 59_999))
    await expect(assertAssistantTokenBudget("u1")).resolves.toBeUndefined()
  })

  it("uses the plan's higher cap for paid users", async () => {
    // pro monthly token cap is 8,000,000 — well above this usage.
    mocks.createRepositoryBundle.mockReturnValue(bundle("pro", 60_001))
    await expect(assertAssistantTokenBudget("u1")).resolves.toBeUndefined()
  })
})
