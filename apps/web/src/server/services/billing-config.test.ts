import { describe, expect, it } from "vitest"

import { FREE_LIMITS, PRO_LIMITS, STARTER_LIMITS, getPlanLimits } from "./billing-config"

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
})
