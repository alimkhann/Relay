import { afterEach, describe, expect, it, vi } from "vitest"

import { GEMINI_MODELS, runGeminiJsonWithFallback } from "./gemini-service"

describe("runGeminiJsonWithFallback", () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("defaults flash-lite traffic to the stable Gemini 3.1 Flash-Lite model", () => {
    expect(GEMINI_MODELS.digest.primary).toBe("gemini-3.1-flash-lite")
    expect(GEMINI_MODELS.adjudication.primary).toBe("gemini-3.1-flash-lite")
    expect(JSON.stringify(GEMINI_MODELS)).not.toContain("gemini-3.1-flash-lite-preview")
  })

  it("falls back when the primary model fails during countTokens", async () => {
    process.env.GEMINI_API_KEY = "test-key\\n"

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Primary model unavailable." } }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "{\"summaryShort\":\"Relay\",\"newDecisions\":[],\"newConstraints\":[],\"newTasks\":[],\"projectOverviewDelta\":null,\"currentObjectiveDelta\":null,\"recentProgressDelta\":null,\"relevantToolsDelta\":[],\"importanceScore\":42,\"shouldMerge\":true,\"confidence\":0.8}" }]
                }
              }
            ],
            usageMetadata: {
              promptTokenCount: 18,
              candidatesTokenCount: 22,
              totalTokenCount: 40
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )

    vi.stubGlobal("fetch", fetchMock)

    const result = await runGeminiJsonWithFallback<Record<string, unknown>>({
      primaryModel: "gemini-3.1-flash-lite",
      fallbackModel: "gemini-2.5-flash-lite",
      systemInstruction: "Return JSON only.",
      prompt: "Summarize Relay.",
      maxInputTokens: 500,
      maxOutputTokens: 200
    })

    expect(result.actualModel).toBe("gemini-2.5-flash-lite")
    expect(result.fallbackUsed).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "x-goog-api-key": "test-key" }),
    })
  })
})
