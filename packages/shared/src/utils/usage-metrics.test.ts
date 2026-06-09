import { describe, expect, it } from "vitest"

import type { BillingStatusDto } from "../types/billing"
import { buildCoreUsageMetrics } from "./usage-metrics"

describe("buildCoreUsageMetrics", () => {
  it("rotates only canonical daily and monthly read/write usage", () => {
    const billing = {
      entitlements: {
        limits: {
          readsDaily: 15,
          readsMonthly: 60,
          writesDaily: 5,
          writesMonthly: 20,
        },
      },
      usage: {
        readsToday: 2,
        readsThisMonth: 8,
        writesToday: 1,
        writesThisMonth: 4,
      },
    } as BillingStatusDto

    expect(buildCoreUsageMetrics(billing)).toEqual([
      { key: "reads_daily", label: "Reads today", used: 2, limit: 15, period: "day" },
      { key: "reads_monthly", label: "Reads this month", used: 8, limit: 60, period: "mo" },
      { key: "writes_daily", label: "Writes today", used: 1, limit: 5, period: "day" },
      { key: "writes_monthly", label: "Writes this month", used: 4, limit: 20, period: "mo" },
    ])
  })
})
