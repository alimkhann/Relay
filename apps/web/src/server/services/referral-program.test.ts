import { beforeEach, describe, expect, it, vi } from "vitest"

const { createRepositoryBundleMock } = vi.hoisted(() => ({
  createRepositoryBundleMock: vi.fn(),
}))

vi.mock("@relay/db", () => ({
  createRepositoryBundle: createRepositoryBundleMock,
}))

import { getReferralProgramForUser } from "./referral-service"

describe("getReferralProgramForUser", () => {
  beforeEach(() => {
    createRepositoryBundleMock.mockReset()
  })

  it("returns a usable referral program even when reward/count lookups fail", async () => {
    createRepositoryBundleMock.mockReturnValue({
      referralCodes: {
        getByUserId: vi.fn().mockResolvedValue({ id: "code-1", userId: "user-1", code: "REF123" }),
        create: vi.fn(),
      },
      referralRewards: {
        listByUserId: vi.fn().mockRejectedValue(new Error("rewards unavailable")),
      },
      referrals: {
        countQualifiedByReferrerSince: vi.fn().mockRejectedValue(new Error("count unavailable")),
      },
    })

    const program = await getReferralProgramForUser("user-1")

    expect(program.code).toBe("REF123")
    expect(program.qualifiedCount).toBe(0)
    expect(program.rewards).toEqual([])
    expect(program.nextTier?.minimumQualifiedReferrals).toBe(1)
  })
})
