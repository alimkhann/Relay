import { describe, expect, it } from "vitest"

import { PerplexityAdapter } from "./adapter"

describe("PerplexityAdapter", () => {
  it("extracts query and answer turns on the root domain layout", () => {
    document.body.innerHTML = `
      <main>
        <section data-testid="query">Summarize the Relay issue.</section>
        <section data-testid="answer">ChatGPT detection fails in the current runtime.</section>
        <textarea></textarea>
      </main>
    `

    const adapter = new PerplexityAdapter()
    const turns = adapter.extractVisibleTurns(document)

    expect(turns).toHaveLength(2)
    expect(turns[0]?.role).toBe("user")
    expect(turns[1]?.role).toBe("assistant")
    expect(adapter.findPromptInput(document)?.element.tagName).toBe("TEXTAREA")
  })
})
