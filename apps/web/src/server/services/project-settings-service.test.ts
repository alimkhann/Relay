import { describe, expect, it } from "vitest"

import { defaultProjectSettings, normalizeProjectSettings } from "./project-settings-service"

describe("project settings service", () => {
  it("normalizes project settings with defaults", () => {
    expect(normalizeProjectSettings({ autonomyMode: "aggressive" })).toEqual({
      ...defaultProjectSettings,
      autonomyMode: "aggressive",
    })
  })

  it("preserves an explicit autoCapture override", () => {
    expect(normalizeProjectSettings({ autoCapture: false })).toEqual({
      ...defaultProjectSettings,
      autoCapture: false,
    })
  })

  it("leaves autoCapture absent when unset (inherit the global setting)", () => {
    // No default for autoCapture → absence means inherit; clearing the override
    // in updateProjectSettings deletes the key, landing back in this shape.
    expect(normalizeProjectSettings({}).autoCapture).toBeUndefined()
    expect("autoCapture" in normalizeProjectSettings({})).toBe(false)
  })
})
