import type { PromptTarget } from "@relay/shared/types/adapter"
import { normalizeText } from "@relay/shared/utils/text"

function hashContent(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return String(hash)
}

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

function isVisiblePrompt(node: HTMLElement) {
  const rect = node.getBoundingClientRect()
  const style = window.getComputedStyle(node)
  const isJsdom = /jsdom/i.test(node.ownerDocument.defaultView?.navigator?.userAgent ?? "")

  return (
    (isJsdom || (rect.width > 0 && rect.height > 0)) &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    !node.hasAttribute("disabled")
  )
}

export function findPrompt(doc: Document, selectors: string[]): PromptTarget | null {
  for (const selector of selectors) {
    const nodes = Array.from(doc.querySelectorAll<HTMLElement>(selector))

    for (const node of nodes) {
      if (!isVisiblePrompt(node)) continue

      return {
        element: node,
        isContentEditable:
          node.isContentEditable ||
          node.contentEditable === "true" ||
          node.getAttribute("contenteditable") === "true"
      }
    }
  }

  return null
}

async function waitForInsertedText(readCurrentValue: () => string, expected: string) {
  const deadline = Date.now() + 350

  while (Date.now() <= deadline) {
    if (normalizeText(readCurrentValue()).includes(expected)) {
      return true
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  return normalizeText(readCurrentValue()).includes(expected)
}

export async function injectText(target: PromptTarget, value: string): Promise<{ ok: boolean; reason?: string }> {
  const expected = normalizeText(value)

  if (target.isContentEditable) {
    target.element.focus()

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target.element)
    selection?.removeAllRanges()
    selection?.addRange(range)

    let inserted = false
    if (typeof document.execCommand === "function") {
      inserted = document.execCommand("insertText", false, value)
    }

    if (!inserted) {
      target.element.textContent = value
    }

    target.element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: value,
        inputType: "insertText"
      })
    )
    target.element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }))
    target.element.dispatchEvent(new Event("change", { bubbles: true }))

    return (await waitForInsertedText(() => target.element.textContent ?? "", expected))
      ? { ok: true }
      : { ok: false, reason: "Prompt editor did not accept the inserted text." }
  }

  if ("value" in target.element) {
    const input = target.element as HTMLTextAreaElement | HTMLInputElement
    input.focus()

    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : input instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : null
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null

    if (descriptor?.set) {
      descriptor.set.call(input, value)
    } else {
      input.value = value
    }

    input.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        data: value,
        inputType: "insertText"
      })
    )
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }))
    input.dispatchEvent(new Event("change", { bubbles: true }))

    return (await waitForInsertedText(() => input.value, expected))
      ? { ok: true }
      : { ok: false, reason: "Prompt textarea did not accept the inserted text." }
  }

  return { ok: false, reason: "No editable prompt field found." }
}
