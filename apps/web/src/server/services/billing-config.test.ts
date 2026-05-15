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
    expect(FREE_LIMITS.historyRetentionDays).toBe(14)
    expect(FREE_LIMITS.mcpDeepReadDaily).toBe(1)
    expect(FREE_LIMITS.mcpWriteDaily).toBe(1)
    expect(FREE_LIMITS.sourcesPerProject).toBe(3)
    expect(FREE_LIMITS.externalSourcesPerProject).toBe(1)
    expect(FREE_LIMITS.externalSourceIndexesDaily).toBe(1)
    expect(FREE_LIMITS.externalSourceSearchesDaily).toBe(3)
    expect(FREE_LIMITS.sourceFileMaxBytes).toBe(10 * 1024 * 1024)
    expect(FREE_LIMITS.sourceOcrPagesMonthly).toBe(0)

    expect(STARTER_LIMITS.captureMonthly).toBe(500)
    expect(STARTER_LIMITS.mcpDeepReadDaily).toBe(8)
    expect(STARTER_LIMITS.aiAnalysesPerProjectDaily).toBe(STARTER_LIMITS.aiAnalysesPerUserDaily)
    expect(STARTER_LIMITS.aiAnalysesPerUserDaily).toBe(25)
    expect(STARTER_LIMITS.sourcesPerProject).toBeGreaterThan(FREE_LIMITS.sourcesPerProject)
    expect(STARTER_LIMITS.externalSourcesPerProject).toBe(10)
    expect(STARTER_LIMITS.externalSourcePagesPerSource).toBe(250)

    expect(PRO_LIMITS.captureMonthly).toBe(1000)
    expect(PRO_LIMITS.mcpDeepReadDaily).toBe(20)
    expect(PRO_LIMITS.aiAnalysesPerProjectDaily).toBe(PRO_LIMITS.aiAnalysesPerUserDaily)
    expect(PRO_LIMITS.aiAnalysesPerUserDaily).toBe(60)
    expect(PRO_LIMITS.externalSourcesPerProject).toBe(50)
    expect(PRO_LIMITS.externalSourcePagesPerSource).toBe(1000)
    expect(PRO_LIMITS.sourceStorageBytes).toBeGreaterThan(STARTER_LIMITS.sourceStorageBytes)
  })

  it("derives plan marketing copy from the runtime limits", () => {
    expect(PLAN_MARKETING_COPY.free.features[0]).toContain(String(FREE_LIMITS.activeProjects))
    expect(PLAN_MARKETING_COPY.starter.features[1]).toContain(String(STARTER_LIMITS.mcpDeepReadDaily))
    expect(PLAN_MARKETING_COPY.pro.features[2]).toContain(PRO_LIMITS.captureMonthly.toLocaleString("en-US"))
  })
})
