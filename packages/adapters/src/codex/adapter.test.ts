import { describe, expect, it } from "vitest"

import { CodexAdapter } from "./adapter"

describe("CodexAdapter", () => {
  it("extracts visible user and assistant turns and finds the prompt", () => {
    document.body.innerHTML = `
      <main>
        <div data-message-author-role="user">Implement the extension fix.</div>
        <div data-message-author-role="assistant">I will update the content script runtime.</div>
        <form><textarea id="prompt-textarea"></textarea></form>
      </main>
    `

    const adapter = new CodexAdapter()
    const turns = adapter.extractVisibleTurns(document)

    expect(turns).toHaveLength(2)
    expect(turns[0]?.role).toBe("user")
    expect(turns[1]?.role).toBe("assistant")
    expect(adapter.findPromptInput(document)?.element.id).toBe("prompt-textarea")
  })

  it("waits for delayed textarea updates before reporting failure", async () => {
    document.body.innerHTML = `
      <main>
        <form><textarea id="prompt-textarea"></textarea></form>
      </main>
    `

    const textarea = document.getElementById("prompt-textarea")
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected a textarea prompt for the test.")
    }

    textarea.addEventListener("input", () => {
      const inserted = textarea.value
      textarea.value = ""
      window.setTimeout(() => {
        textarea.value = inserted
      }, 40)
    })

    const adapter = new CodexAdapter()

    await expect(adapter.insertTextIntoPrompt("Continue with this project", document)).resolves.toEqual({
      ok: true,
    })
  })
})
