import { describe, expect, it } from "vitest"

import { resolveAdapter } from "./adapter-registry"

describe("adapter registry", () => {
  it("detects ChatGPT", () => {
    const adapter = resolveAdapter("https://chatgpt.com/c/abc")

    expect(adapter?.getPlatform()).toBe("chatgpt")
  })

  it("detects Codex on ChatGPT routes before ChatGPT", () => {
    const adapter = resolveAdapter("https://chatgpt.com/codex")

    expect(adapter?.getPlatform()).toBe("codex")
  })

  it("detects legacy Codex routes", () => {
    const adapter = resolveAdapter("https://codex.openai.com/session/abc")

    expect(adapter?.getPlatform()).toBe("codex")
  })

  it("detects the root Perplexity domain", () => {
    const adapter = resolveAdapter("https://perplexity.ai/search/test")

    expect(adapter?.getPlatform()).toBe("perplexity")
  })

  it("detects Claude", () => {
    const adapter = resolveAdapter("https://claude.ai/new")

    expect(adapter?.getPlatform()).toBe("claude")
  })
})
