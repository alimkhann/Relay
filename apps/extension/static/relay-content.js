(function () {
  const siteConfigs = [
    {
      platform: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"],
      turnSelectors: ["[data-message-author-role]", "article[data-testid^='conversation-turn']"],
      promptSelectors: ["form textarea", "main textarea", "[contenteditable='true']"],
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

  function findPrompt(config) {
    for (const selector of config.promptSelectors) {
      const element = document.querySelector(selector)
      if (!element) continue

      return {
        element,
        isContentEditable: Boolean(element.isContentEditable)
      }
    }

    return null
  }

  function insertIntoPrompt(config, text) {
    const target = findPrompt(config)
    if (!target) {
      return { ok: false, reason: "Prompt not found." }
    }

    const element = target.element

    if (target.isContentEditable) {
      element.focus()
      element.textContent = ""
      if (typeof document.execCommand === "function") {
        document.execCommand("insertText", false, text)
      } else {
        element.textContent = text
      }
      element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }))
      return { ok: true }
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
      element.dispatchEvent(new Event("input", { bubbles: true }))
      element.dispatchEvent(new Event("change", { bubbles: true }))
      return { ok: true }
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
        turns: turns.length
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
