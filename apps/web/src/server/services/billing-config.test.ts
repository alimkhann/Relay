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
    expect(FREE_LIMITS.readsMonthly).toBe(60)
    expect(FREE_LIMITS.readsDaily).toBe(15)
    expect(FREE_LIMITS.writesMonthly).toBe(20)
    expect(FREE_LIMITS.writesDaily).toBe(5)
    expect(FREE_LIMITS.sourcesPerProject).toBe(3)
    expect(FREE_LIMITS.externalSourcesPerProject).toBe(1)
    expect(FREE_LIMITS.externalSourceIndexesDaily).toBe(1)
    expect(FREE_LIMITS.externalSourceSearchesDaily).toBe(3)
    expect(FREE_LIMITS.sourceFileMaxBytes).toBe(10 * 1024 * 1024)
    expect(FREE_LIMITS.sourceOcrPagesMonthly).toBe(0)

    expect(STARTER_LIMITS.readsMonthly).toBe(1_000)
    expect(STARTER_LIMITS.writesMonthly).toBe(500)
    expect(STARTER_LIMITS.aiAnalysesPerProjectDaily).toBe(STARTER_LIMITS.aiAnalysesPerUserDaily)
    expect(STARTER_LIMITS.aiAnalysesPerUserDaily).toBe(25)
    expect(STARTER_LIMITS.sourcesPerProject).toBe(15)
    expect(STARTER_LIMITS.externalSourcesPerProject).toBe(5)
    expect(STARTER_LIMITS.externalSourcePagesPerSource).toBe(250)
    expect(STARTER_LIMITS.assistantMessagesMonthly).toBe(150)
    expect(STARTER_LIMITS.assistantMessagesDaily).toBe(20)
    expect(STARTER_LIMITS.assistantTokensMonthly).toBe(500_000)
    expect(STARTER_LIMITS.assistantMaxSteps).toBe(12)

    expect(PRO_LIMITS.readsMonthly).toBe(3_000)
    expect(PRO_LIMITS.writesMonthly).toBe(1_500)
    expect(PRO_LIMITS.aiAnalysesPerProjectDaily).toBe(PRO_LIMITS.aiAnalysesPerUserDaily)
    expect(PRO_LIMITS.aiAnalysesPerUserDaily).toBe(60)
    expect(PRO_LIMITS.sourcesPerProject).toBe(50)
    expect(PRO_LIMITS.externalSourcesPerProject).toBe(20)
    expect(PRO_LIMITS.externalSourcePagesPerSource).toBe(1000)
    expect(PRO_LIMITS.sourceStorageBytes).toBeGreaterThan(STARTER_LIMITS.sourceStorageBytes)
    expect(PRO_LIMITS.assistantMessagesMonthly).toBe(600)
    expect(PRO_LIMITS.assistantMessagesDaily).toBe(60)
    expect(PRO_LIMITS.assistantTokensMonthly).toBe(2_000_000)
    expect(PRO_LIMITS.assistantMaxSteps).toBe(20)
  })

  it("derives plan marketing copy from the runtime limits", () => {
    expect(PLAN_MARKETING_COPY.free.features[0]).toContain(String(FREE_LIMITS.activeProjects))
    expect(PLAN_MARKETING_COPY.starter.features[1]).toContain(STARTER_LIMITS.readsMonthly.toLocaleString("en-US"))
    expect(PLAN_MARKETING_COPY.pro.features[2]).toContain(PRO_LIMITS.writesMonthly.toLocaleString("en-US"))
  })
})
