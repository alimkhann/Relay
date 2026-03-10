import { describe, expect, it } from "vitest"

import { resolveAdapter } from "./adapter-registry"

describe("adapter registry", () => {
  it("detects ChatGPT", () => {
    const adapter = resolveAdapter("https://chatgpt.com/c/abc")

    expect(adapter?.getPlatform()).toBe("chatgpt")
  })
})
