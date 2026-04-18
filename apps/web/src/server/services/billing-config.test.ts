import { describe, expect, it } from "vitest"

import { FREE_LIMITS, PLAN_MARKETING_COPY, PRO_LIMITS, STARTER_LIMITS, getPlanLimits } from "./billing-config"

describe("billing plan limits", () => {
  it("returns distinct starter and pro limits", () => {
    expect(getPlanLimits("starter")).toEqual(STARTER_LIMITS)
    expect(getPlanLimits("pro")).toEqual(PRO_LIMITS)
    expect(PRO_LIMITS.mcpDeepReadDaily).toBeGreaterThan(STARTER_LIMITS.mcpDeepReadDaily)
    expect(STARTER_LIMITS.mcpDeepReadDaily).toBeGreaterThan(FREE_LIMITS.mcpDeepReadDaily)
  })

  it("keeps free intentionally trial-like and starter/pro meaningfully bounded", () => {
    expect(FREE_LIMITS.historyRetentionDays).toBe(7)
    expect(FREE_LIMITS.mcpDeepReadDaily).toBe(2)
    expect(FREE_LIMITS.mcpWriteDaily).toBe(1)

    expect(STARTER_LIMITS.historyRetentionDays).toBe(180)
    expect(STARTER_LIMITS.mcpDeepReadDaily).toBe(12)
    expect(STARTER_LIMITS.aiAnalysesPerUserDaily).toBe(40)

    expect(PRO_LIMITS.historyRetentionDays).toBe(365)
    expect(PRO_LIMITS.mcpDeepReadDaily).toBe(30)
    expect(PRO_LIMITS.aiAnalysesPerUserDaily).toBe(90)
  })

  it("derives plan marketing copy from the runtime limits", () => {
    expect(PLAN_MARKETING_COPY.free.features[0]).toContain(String(FREE_LIMITS.activeProjects))
    expect(PLAN_MARKETING_COPY.starter.features[1]).toContain(String(STARTER_LIMITS.mcpDeepReadDaily))
    expect(PLAN_MARKETING_COPY.pro.features[2]).toContain(PRO_LIMITS.captureMonthly.toLocaleString("en-US"))
  })
})
