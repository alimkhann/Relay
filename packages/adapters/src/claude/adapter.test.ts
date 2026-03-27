import { describe, expect, it } from "vitest"

import { ClaudeAdapter } from "./adapter"

describe("ClaudeAdapter", () => {
  it("extracts visible turns and finds the prompt editor", () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="message-human">Ship the vendor fix.</div>
        <div data-testid="message-assistant">I will patch the extension runtime.</div>
      </main>
      <div contenteditable="true" style="width: 320px; height: 48px;">Draft</div>
    `

    const adapter = new ClaudeAdapter()
    const turns = adapter.extractVisibleTurns(document)

    expect(turns).toHaveLength(2)
    expect(turns[0]?.role).toBe("user")
    expect(turns[1]?.role).toBe("assistant")
    expect(adapter.findPromptInput(document)?.isContentEditable).toBe(true)
  })

  it("ignores streaming containers that are not actual chat turns", () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="message-human">Why did Relay recapture this?</div>
        <div data-is-streaming="true">Streaming shell that should not count as a turn.</div>
        <div data-testid="message-assistant">Because the DOM shape kept changing.</div>
      </main>
    `

    const adapter = new ClaudeAdapter()
    const turns = adapter.extractVisibleTurns(document)

    expect(turns).toHaveLength(2)
    expect(turns.map((turn) => turn.content)).toEqual([
      "Why did Relay recapture this?",
      "Because the DOM shape kept changing.",
    ])
  })

  it("waits for delayed contenteditable updates before reporting failure", async () => {
    document.body.innerHTML = `
      <main></main>
      <div contenteditable="true" style="width: 320px; height: 48px;"></div>
    `

    const editor = document.querySelector("div[contenteditable='true']")
    if (!(editor instanceof HTMLDivElement)) {
      throw new Error("Expected a contenteditable prompt for the test.")
    }

    editor.addEventListener("input", () => {
      const inserted = editor.textContent ?? ""
      editor.textContent = ""
      window.setTimeout(() => {
        editor.textContent = inserted
      }, 40)
    })

    const adapter = new ClaudeAdapter()

    await expect(adapter.insertTextIntoPrompt("Keep the architectural notes", document)).resolves.toEqual({
      ok: true,
    })
  })
})
