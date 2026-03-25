import { describe, expect, it } from "vitest"

import { inferTargetProfile, resolveTargetProfile } from "./target-profile"

describe("target profile resolution", () => {
  it("uses the live platform when target mode is automatic", () => {
    expect(resolveTargetProfile({ platform: "chatgpt", targetMode: "auto", manualTargetProfileKey: "claude_code_build" })).toBe(
      "chatgpt_planning"
    )
  })

  it("preserves the explicit manual override", () => {
    expect(resolveTargetProfile({ platform: "chatgpt", targetMode: "manual", manualTargetProfileKey: "claude_code_build" })).toBe(
      "claude_code_build"
    )
  })

  it("infers the default target for Codex", () => {
    expect(inferTargetProfile("codex")).toBe("codex_implementation")
  })

  it("infers the correct target for Gemini", () => {
    expect(inferTargetProfile("gemini")).toBe("gemini_exploration")
  })

  it("infers the correct target for Grok", () => {
    expect(inferTargetProfile("grok")).toBe("grok_conversation")
  })

  it("infers the correct target for DeepSeek", () => {
    expect(inferTargetProfile("deepseek")).toBe("deepseek_reasoning")
  })
})
