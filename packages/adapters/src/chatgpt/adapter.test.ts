import { describe, expect, it } from "vitest"

import { ChatgptAdapter } from "./adapter"

describe("ChatgptAdapter", () => {
  it("extracts visible user and assistant turns", () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user">Build Relay MVP.</article>
        <article data-message-author-role="assistant">Use a browser extension with a web dashboard.</article>
        <form><textarea></textarea></form>
      </main>
    `

    const adapter = new ChatgptAdapter()
    const turns = adapter.extractVisibleTurns(document)

    expect(turns).toHaveLength(2)
    expect(turns[0]?.role).toBe("user")
    expect(turns[1]?.role).toBe("assistant")
    expect(adapter.findPromptInput(document)?.element.tagName).toBe("TEXTAREA")
  })
})
