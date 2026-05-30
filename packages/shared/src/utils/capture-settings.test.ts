import { describe, expect, it } from "vitest"

import { effectiveAutoCapture, effectiveInlineChip } from "./capture-settings"

describe("effectiveAutoCapture", () => {
  it("falls back to the global setting when nothing is overridden", () => {
    expect(
      effectiveAutoCapture({ platform: "chatgpt", global: true }),
    ).toBe(true)
    expect(
      effectiveAutoCapture({ platform: "chatgpt", global: false }),
    ).toBe(false)
  })

  it("project override beats global", () => {
    expect(
      effectiveAutoCapture({ platform: "chatgpt", global: true, project: false }),
    ).toBe(false)
    expect(
      effectiveAutoCapture({ platform: "chatgpt", global: false, project: true }),
    ).toBe(true)
  })

  it("platform leaf beats project and global", () => {
    expect(
      effectiveAutoCapture({
        platform: "claude",
        global: true,
        project: true,
        projectPlatforms: { claude: false },
      }),
    ).toBe(false)
    expect(
      effectiveAutoCapture({
        platform: "claude",
        global: false,
        project: false,
        projectPlatforms: { claude: true },
      }),
    ).toBe(true)
  })

  it("a leaf for a different platform does not apply", () => {
    expect(
      effectiveAutoCapture({
        platform: "gemini",
        global: false,
        project: true,
        projectPlatforms: { claude: false },
      }),
    ).toBe(true)
  })

  it("null platform skips the leaf and resolves project → global", () => {
    expect(
      effectiveAutoCapture({
        platform: null,
        global: true,
        project: false,
        projectPlatforms: { chatgpt: true },
      }),
    ).toBe(false)
    expect(
      effectiveAutoCapture({ platform: null, global: true }),
    ).toBe(true)
  })

  it("null/undefined overrides inherit (do not coerce to false)", () => {
    expect(
      effectiveAutoCapture({
        platform: "chatgpt",
        global: true,
        project: null,
        projectPlatforms: null,
      }),
    ).toBe(true)
  })
})

describe("effectiveInlineChip", () => {
  it("uses the same leaf > project > global resolution", () => {
    expect(
      effectiveInlineChip({
        platform: "perplexity",
        global: false,
        project: true,
        projectPlatforms: { perplexity: false },
      }),
    ).toBe(false)
    expect(
      effectiveInlineChip({ platform: "perplexity", global: true }),
    ).toBe(true)
  })
})
