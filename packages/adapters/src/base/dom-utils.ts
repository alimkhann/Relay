import { hashContent, normalizeText, type PromptTarget } from "@relay/shared"

export function collectTurns(doc: Document, selectors: string[], roleResolver?: (node: Element) => string) {
  return selectors
    .flatMap((selector) => Array.from(doc.querySelectorAll(selector)))
    .filter((node, index, all) => all.indexOf(node) === index)
    .map((node, index) => ({
      role: (roleResolver?.(node) ?? node.getAttribute("data-message-author-role") ?? "unknown") as
        | "user"
        | "assistant"
        | "system"
        | "unknown",
      content: normalizeText(node.textContent ?? ""),
      turnIndex: index,
      rawHtml: node.innerHTML,
      contentHash: hashContent(normalizeText(node.textContent ?? ""))
    }))
    .filter((turn) => turn.content.length > 0)
}

export function findPrompt(doc: Document, selectors: string[]): PromptTarget | null {
  for (const selector of selectors) {
    const node = doc.querySelector<HTMLElement>(selector)

    if (node) {
      return {
        element: node,
        isContentEditable: node.isContentEditable
      }
    }
  }

  return null
}

export async function injectText(target: PromptTarget, value: string): Promise<{ ok: boolean; reason?: string }> {
  if (target.isContentEditable) {
    target.element.textContent = value
    target.element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }))
    return { ok: true }
  }

  if ("value" in target.element) {
    const input = target.element as HTMLTextAreaElement | HTMLInputElement
    input.focus()
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
    return { ok: true }
  }

  return { ok: false, reason: "No editable prompt field found." }
}
