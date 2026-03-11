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
})
