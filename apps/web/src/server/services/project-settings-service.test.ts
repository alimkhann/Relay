import { describe, expect, it } from "vitest"

import { defaultProjectSettings, normalizeProjectSettings } from "./project-settings-service"

describe("project settings service", () => {
  it("normalizes project settings with defaults", () => {
    expect(normalizeProjectSettings({ autonomyMode: "aggressive" })).toEqual({
      ...defaultProjectSettings,
      autonomyMode: "aggressive",
    })
  })
})
