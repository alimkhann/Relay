import { describe, expect, it } from "vitest"

import { ChatgptAdapter } from "./adapter"

describe("ChatgptAdapter", () => {
  it("extracts visible user and assistant turns", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">Build Relay MVP.</div>
        <div data-message-author-role="assistant">Use a browser extension with a web dashboard.</div>
        <article data-testid="conversation-turn">You said: Build Relay MVP.</article>
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

  it("does not claim Codex routes on ChatGPT", () => {
    const adapter = new ChatgptAdapter()

    expect(adapter.canHandle("https://chatgpt.com/codex")).toBe(false)
  })

  it("treats delayed textarea acceptance as a successful insert", async () => {
    document.body.innerHTML = `
      <main>
        <form><textarea></textarea></form>
      </main>
    `

    const textarea = document.querySelector("textarea")
    if (!textarea) {
      throw new Error("Expected a textarea prompt for the test.")
    }

    textarea.addEventListener("input", () => {
      const inserted = textarea.value
      textarea.value = ""
      window.setTimeout(() => {
        textarea.value = inserted
      }, 40)
    })

    const adapter = new ChatgptAdapter()

    await expect(adapter.insertTextIntoPrompt("Insert this brief", document)).resolves.toEqual({ ok: true })
  })
})
