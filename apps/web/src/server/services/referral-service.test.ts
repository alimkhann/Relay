import { describe, expect, it } from "vitest"

import {
  getReferralRefereeDiscountBasisPoints,
  getReferralRewardBasisPoints,
  getReferralRewardQualification,
  getReferralRewardValueCents,
  isReferralRewardQualifiable,
} from "./referral-service"

describe("referral reward policy", () => {
  it("uses conservative paid-referral tiers in a rolling window", () => {
    expect(getReferralRewardBasisPoints(0)).toBe(0)
    expect(getReferralRewardBasisPoints(1)).toBe(2500)
    expect(getReferralRewardBasisPoints(2)).toBe(2500)
    expect(getReferralRewardBasisPoints(3)).toBe(5000)
    expect(getReferralRewardBasisPoints(4)).toBe(5000)
    expect(getReferralRewardBasisPoints(5)).toBe(10000)
    expect(getReferralRewardBasisPoints(12)).toBe(10000)
  })

  it("discounts referred users only on the first paid period", () => {
    expect(getReferralRefereeDiscountBasisPoints("month")).toBe(2000)
    expect(getReferralRefereeDiscountBasisPoints("year")).toBe(1000)
  })

  it("qualifies monthly referrals only after the second paid invoice", () => {
    expect(getReferralRewardQualification("month")).toEqual({
      minimumPaidInvoiceCount: 2,
      holdDaysAfterFirstPaidInvoice: 0,
    })
    expect(
      isReferralRewardQualifiable({
        interval: "month",
        paidInvoiceCount: 1,
        firstPaidAt: "2026-01-01T00:00:00.000Z",
        now: new Date("2026-03-01T00:00:00.000Z"),
      }),
    ).toBe(false)
    expect(
      isReferralRewardQualifiable({
        interval: "month",
        paidInvoiceCount: 2,
        firstPaidAt: "2026-01-01T00:00:00.000Z",
        now: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ).toBe(true)
  })

  it("qualifies annual referrals after first paid invoice plus a 30-day hold", () => {
    expect(getReferralRewardQualification("year")).toEqual({
      minimumPaidInvoiceCount: 1,
      holdDaysAfterFirstPaidInvoice: 30,
    })
    expect(
      isReferralRewardQualifiable({
        interval: "year",
        paidInvoiceCount: 1,
        firstPaidAt: "2026-01-01T00:00:00.000Z",
        now: new Date("2026-01-30T23:59:59.000Z"),
      }),
    ).toBe(false)
    expect(
      isReferralRewardQualifiable({
        interval: "year",
        paidInvoiceCount: 1,
        firstPaidAt: "2026-01-01T00:00:00.000Z",
        now: new Date("2026-01-31T00:00:00.000Z"),
      }),
    ).toBe(true)
  })

  it("caps referrer reward value to a monthly-equivalent credit", () => {
    expect(getReferralRewardValueCents("starter", 2500)).toBe(150)
    expect(getReferralRewardValueCents("starter", 10000)).toBe(600)
    expect(getReferralRewardValueCents("pro", 5000)).toBe(600)
  })
})
