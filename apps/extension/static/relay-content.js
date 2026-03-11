(function () {
  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  }

  const siteConfigs = [
    {
      platform: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"],
      turnSelectors: ["[data-message-author-role]", "article[data-testid^='conversation-turn']"],
      promptSelectors: [
        "#prompt-textarea",
        "form #prompt-textarea",
        "form [contenteditable='true']",
        "form textarea",
        "main textarea"
      ],
      getRole(node) {
        return node.getAttribute("data-message-author-role") || "unknown"
      }
    },
    {
      platform: "codex",
      hosts: ["codex.openai.com"],
      turnSelectors: ["[data-message-author-role]", "article[data-testid^='conversation-turn']"],
      promptSelectors: [
        "#prompt-textarea",
        "form #prompt-textarea",
        "form [contenteditable='true']",
        "form textarea",
        "main textarea"
      ],
      getRole(node) {
        return node.getAttribute("data-message-author-role") || "unknown"
      }
    },
    {
      platform: "claude",
      hosts: ["claude.ai"],
      turnSelectors: ["[data-is-streaming]", "main [data-testid='message-human']", "main [data-testid='message-assistant']"],
      promptSelectors: ["div[contenteditable='true']", "textarea"],
      getRole(node) {
        return node.getAttribute("data-testid") === "message-human" ? "user" : "assistant"
      }
    },
    {
      platform: "perplexity",
      hosts: ["www.perplexity.ai", "perplexity.ai"],
      turnSelectors: ["main [data-testid='answer']", "main [data-testid='query']", "main article"],
      promptSelectors: ["textarea", "[contenteditable='true']"],
      getRole(node) {
        return node.getAttribute("data-testid") === "query" ? "user" : "assistant"
      }
    }
  ]

  function normalizeText(input) {
    return (input || "").replace(/\s+/g, " ").trim()
  }

  function computeSignature(turns, metadata, platform) {
    const payload = JSON.stringify({
      platform,
      url: metadata.url,
      pageFingerprint: metadata.pageFingerprint,
      turns: turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
        turnIndex: turn.turnIndex
      }))
    })

    let hash = 0
    for (let index = 0; index < payload.length; index += 1) {
      hash = (hash << 5) - hash + payload.charCodeAt(index)
      hash |= 0
    }
    return String(hash)
  }

  function getSiteConfig() {
    const hostname = window.location.hostname
    return siteConfigs.find((config) => config.hosts.includes(hostname)) || null
  }

  function collectTurns(config) {
    const seen = new Set()
    const turns = []

    for (const selector of config.turnSelectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (seen.has(node)) continue
        seen.add(node)

        const content = normalizeText(node.textContent)
        if (!content) continue

        turns.push({
          role: config.getRole(node),
          content,
          turnIndex: turns.length,
          rawHtml: node.innerHTML || null
        })
      }
    }

    return turns
  }

  function getPageMetadata() {
    const url = new URL(window.location.href)
    return {
      title: document.title || null,
      url: url.toString(),
      pathname: url.pathname,
      pageFingerprint: url.pathname.split("/").filter(Boolean).pop() || null,
      domain: url.hostname
    }
  }

  function inferFreshChat(config, turns, metadata) {
    if (!turns.length) return true

    const pathname = metadata.pathname || "/"
    if (config.platform === "claude" && pathname.includes("/new")) return true
    if ((config.platform === "chatgpt" || config.platform === "codex") && pathname === "/") return turns.length === 0
    if (config.platform === "perplexity" && pathname === "/") return turns.length === 0

    return false
  }

  function findPrompt(config) {
    for (const selector of config.promptSelectors) {
      const elements = Array.from(document.querySelectorAll(selector))

      for (const element of elements) {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          !element.hasAttribute("disabled")

        if (!isVisible) continue

        return {
          element,
          isContentEditable: Boolean(element.isContentEditable)
        }
      }
    }

    return null
  }

  function readPromptText(target) {
    if (target.isContentEditable) {
      return normalizeText(target.element.textContent)
    }

    if ("value" in target.element) {
      return normalizeText(target.element.value)
    }

    return ""
  }

  function insertIntoPrompt(config, text) {
    const target = findPrompt(config)
    if (!target) {
      return { ok: false, reason: "Prompt not found." }
    }

    const element = target.element
    const expected = normalizeText(text)

    if (target.isContentEditable) {
      element.focus()
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(element)
      selection.removeAllRanges()
      selection.addRange(range)

      let inserted = false

      if (typeof document.execCommand === "function") {
        inserted = document.execCommand("insertText", false, text)
      }

      if (!inserted) {
        const html = text
          .split("\n")
          .map((line) => `<p>${line ? escapeHtml(line) : "<br>"}</p>`)
          .join("")

        element.innerHTML = html
      }

      element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: text, inputType: "insertText" }))
      element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }))
      element.dispatchEvent(new Event("change", { bubbles: true }))

      return readPromptText(target).includes(expected)
        ? { ok: true }
        : { ok: false, reason: "Prompt editor did not accept the inserted text." }
    }

    if ("value" in element) {
      element.focus()
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : element instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : null

      const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null
      if (descriptor && typeof descriptor.set === "function") {
        descriptor.set.call(element, text)
      } else {
        element.value = text
      }
      element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: text, inputType: "insertText" }))
      element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }))
      element.dispatchEvent(new Event("change", { bubbles: true }))

      return readPromptText(target).includes(expected)
        ? { ok: true }
        : { ok: false, reason: "Prompt textarea did not accept the inserted text." }
    }

    return { ok: false, reason: "No editable prompt field found." }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const config = getSiteConfig()

    if (message.type === "RELAY_PAGE_STATE") {
      if (!config) {
        sendResponse({ supported: false })
        return true
      }

      const turns = collectTurns(config)
      const metadata = getPageMetadata()

      sendResponse({
        supported: true,
        platform: config.platform,
        title: metadata.title,
        url: metadata.url,
        turns: turns.length,
        captureSignature: computeSignature(turns, metadata, config.platform),
        isFreshChat: inferFreshChat(config, turns, metadata)
      })
      return true
    }

    if (message.type === "RELAY_CAPTURE_VISIBLE") {
      if (!config) {
        sendResponse({ ok: false, reason: "Unsupported site." })
        return true
      }

      const turns = collectTurns(config)
      const metadata = getPageMetadata()

      sendResponse({
        ok: true,
        capture: {
          platform: config.platform,
          session: {
            title: metadata.title,
            url: metadata.url,
            pageFingerprint: metadata.pageFingerprint,
            captureSignature: computeSignature(turns, metadata, config.platform),
            metadata: {
              domain: metadata.domain,
              pathname: metadata.pathname
            }
          },
          turns
        }
      })
      return true
    }

    if (message.type === "RELAY_GET_SELECTION") {
      if (!config) {
        sendResponse({ ok: false, reason: "Unsupported site." })
        return true
      }

      const text = normalizeText(window.getSelection ? window.getSelection().toString() : "")
      if (!text) {
        sendResponse({ ok: false, reason: "Select text in the page first." })
        return true
      }

      const metadata = getPageMetadata()
      sendResponse({
        ok: true,
        text,
        platform: config.platform,
        metadata: {
          url: metadata.url,
          title: metadata.title,
          pathname: metadata.pathname
        }
      })
      return true
    }

    if (message.type === "RELAY_INSERT_CONTEXT") {
      if (!config) {
        sendResponse({ ok: false, reason: "Unsupported site." })
        return true
      }

      sendResponse(insertIntoPrompt(config, message.payload.content))
      return true
    }

    return false
  })
})()
