import { describe, expect, it } from "vitest"

import { estimateGeminiCostUsd, resolveGeminiModelPricing } from "./ai-analytics-service"

describe("resolveGeminiModelPricing", () => {
  it("matches flash-lite pricing families", () => {
    expect(resolveGeminiModelPricing("gemini-3.1-flash-lite")).toMatchObject({
      inputUsdPerMillion: 0.1,
      outputUsdPerMillion: 0.4,
    })
  })

  it("matches gemini-3 flash pricing families", () => {
    expect(resolveGeminiModelPricing("gemini-3-flash-preview")).toMatchObject({
      inputUsdPerMillion: 0.5,
      outputUsdPerMillion: 3,
    })
  })
})

describe("estimateGeminiCostUsd", () => {
  it("estimates spend from input and output tokens", () => {
    const estimate = estimateGeminiCostUsd({
      model: "gemini-3-flash-preview",
      tokenUsage: {
        inputTokens: 200_000,
        outputTokens: 50_000,
      },
    })

    expect(estimate.estimatedCostUsd).toBe(0.25)
    expect(estimate.estimationMethod).toBe("gemini_pricing_table")
  })

  it("returns zero when model pricing is unknown", () => {
    const estimate = estimateGeminiCostUsd({
      model: "custom-gemini-preview",
      tokenUsage: {
        inputTokens: 100_000,
        outputTokens: 100_000,
      },
    })

    expect(estimate.estimatedCostUsd).toBe(0)
    expect(estimate.estimationMethod).toBe("missing_model_pricing")
  })
})
