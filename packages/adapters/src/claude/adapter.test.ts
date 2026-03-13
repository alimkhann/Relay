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
})
