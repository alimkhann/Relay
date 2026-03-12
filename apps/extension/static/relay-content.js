(function () {
  const PAGE_STABLE_MS = 1800
  const FRESH_CHAT_STABILIZE_MS = 800

  const siteConfigs = [
    {
      platform: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"],
      turnSelectors: ["[data-message-author-role]"],
      promptSelectors: ["#prompt-textarea", "form #prompt-textarea", "form [contenteditable='true']", "form textarea", "main textarea"],
      streamingSelectors: ["button[aria-label*='Stop']", "[data-testid='stop-button']"],
      getRole(node) {
        return node.getAttribute("data-message-author-role") || "unknown"
      }
    },
    {
      platform: "codex",
      hosts: ["codex.openai.com"],
      turnSelectors: ["[data-message-author-role]"],
      promptSelectors: ["#prompt-textarea", "form #prompt-textarea", "form [contenteditable='true']", "form textarea", "main textarea"],
      streamingSelectors: ["button[aria-label*='Stop']", "[data-testid='stop-button']"],
      getRole(node) {
        return node.getAttribute("data-message-author-role") || "unknown"
      }
    },
    {
      platform: "claude",
      hosts: ["claude.ai"],
      turnSelectors: ["[data-is-streaming]", "main [data-testid='message-human']", "main [data-testid='message-assistant']"],
      promptSelectors: ["div[contenteditable='true']", "textarea"],
      streamingSelectors: ["[data-is-streaming='true']"],
      getRole(node) {
        return node.getAttribute("data-testid") === "message-human" ? "user" : "assistant"
      }
    },
    {
      platform: "perplexity",
      hosts: ["www.perplexity.ai", "perplexity.ai"],
      turnSelectors: ["main [data-testid='answer']", "main [data-testid='query']", "main article"],
      promptSelectors: ["textarea", "[contenteditable='true']"],
      streamingSelectors: ["button[aria-label*='Stop']", "[data-testid='stop-generating']"],
      getRole(node) {
        return node.getAttribute("data-testid") === "query" ? "user" : "assistant"
      }
    }
  ]

  const relayChipState = {
    dismissed: false,
    href: window.location.href,
    forcedInsertKind: null,
    observationTimer: null,
    lastMeaningfulMutationAt: Date.now(),
    freshCandidateSince: 0,
    lastPageStateKey: "",
    pageState: null,
    currentState: null,
    buttonMode: "idle",
    buttonError: "",
    exitTimer: null,
    resetButtonTimer: null,
    mounted: false
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  }

  function normalizeText(input) {
    return (input || "").replace(/\s+/g, " ").trim()
  }

  function cleanTurnContent(input) {
    return normalizeText(input)
      .replace(/^You said:\s*/i, "")
      .replace(/^ChatGPT said:\s*/i, "")
      .replace(/^Claude said:\s*/i, "")
      .replace(/^Codex said:\s*/i, "")
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
    const seenNodes = new Set()
    const seenContent = new Set()
    const turns = []

    for (const selector of config.turnSelectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (seenNodes.has(node)) continue
        seenNodes.add(node)

        const role = config.getRole(node)
        const content = cleanTurnContent(node.textContent)
        if (!content || role === "unknown") continue

        const contentKey = `${role}:${content.toLowerCase()}`
        if (seenContent.has(contentKey)) continue
        seenContent.add(contentKey)

        turns.push({
          role,
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

  function hasStreamingActivity(config) {
    return config.streamingSelectors.some((selector) => document.querySelector(selector))
  }

  function inferFreshRoute(config, metadata) {
    const pathname = metadata.pathname || "/"

    if (config.platform === "claude") {
      return pathname.includes("/new")
    }

    return pathname === "/"
  }

  function computePageState(config) {
    if (!config) {
      return { supported: false }
    }

    const turns = collectTurns(config)
    const metadata = getPageMetadata()
    const promptTarget = findPrompt(config)
    const isFreshRoute = inferFreshRoute(config, metadata)
    const promptReady = Boolean(promptTarget)
    const candidateFresh = isFreshRoute && promptReady && turns.length === 0

    if (!candidateFresh) {
      relayChipState.freshCandidateSince = 0
    } else if (!relayChipState.freshCandidateSince) {
      relayChipState.freshCandidateSince = Date.now()
    }

    const isStable = Date.now() - relayChipState.lastMeaningfulMutationAt >= PAGE_STABLE_MS
    const isFreshChat = candidateFresh && Date.now() - relayChipState.freshCandidateSince >= FRESH_CHAT_STABILIZE_MS

    return {
      supported: true,
      platform: config.platform,
      title: metadata.title,
      url: metadata.url,
      domain: metadata.domain,
      pathname: metadata.pathname,
      pageFingerprint: metadata.pageFingerprint,
      turns: turns.length,
      captureSignature: computeSignature(turns, metadata, config.platform),
      promptReady,
      isFreshRoute,
      isFreshChat,
      isStable,
      isStreaming: hasStreamingActivity(config)
    }
  }

  function buildPageStateKey(pageState) {
    return JSON.stringify({
      supported: pageState.supported,
      url: pageState.url,
      turns: pageState.turns,
      captureSignature: pageState.captureSignature,
      promptReady: pageState.promptReady,
      isFreshRoute: pageState.isFreshRoute,
      isFreshChat: pageState.isFreshChat,
      isStable: pageState.isStable,
      isStreaming: pageState.isStreaming
    })
  }

  function buildFallbackState(pageState) {
    return {
      projectId: null,
      projectName: "Checking project",
      projectOptions: [],
      showCue: true,
      status: "updating",
      message: "Checking this chat…",
      trustLine: "Built from recent chats and saved project context",
      freshnessText: null,
      shortcutLabel: "Mod+Shift+I",
      canInsert: false,
      page: pageState,
      trust: {
        updatedAt: null,
        updatedLabel: null,
        recentChatCount: 0,
        savedContextCount: 0
      },
      remoteStatus: "loading",
      issue: null,
      insertKind: pageState.isFreshChat ? "fresh_chat_bootstrap" : "quick_continuity",
      lastSuccessfulSyncAt: null,
      capturePending: false
    }
  }

  function isValidActiveProjectState(state) {
    return Boolean(
      state &&
        typeof state === "object" &&
        state.page &&
        typeof state.page.supported === "boolean" &&
        Array.isArray(state.projectOptions)
    )
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message })
          return
        }

        resolve(response)
      })
    })
  }

  function clearChipTimers() {
    if (relayChipState.exitTimer !== null) {
      window.clearTimeout(relayChipState.exitTimer)
      relayChipState.exitTimer = null
    }

    if (relayChipState.resetButtonTimer !== null) {
      window.clearTimeout(relayChipState.resetButtonTimer)
      relayChipState.resetButtonTimer = null
    }
  }

  function ensureInlineChipStyles() {
    if (document.getElementById("relay-inline-chip-styles")) return

    const style = document.createElement("style")
    style.id = "relay-inline-chip-styles"
    style.textContent = `
      .relay-inline-chip {
        width: min(372px, calc(100vw - 32px));
        border: 1px solid rgba(19, 24, 19, 0.12);
        border-radius: 20px;
        background: rgba(248, 246, 238, 0.97);
        color: #151915;
        box-shadow: 0 22px 58px rgba(12, 17, 12, 0.15);
        backdrop-filter: blur(18px);
        font-family: "Avenir Next", "Neue Haas Grotesk Text", sans-serif;
        overflow: hidden;
        z-index: 2147483000;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 160ms ease-out, transform 160ms ease-out;
      }

      .relay-inline-chip--visible {
        opacity: 1;
        transform: translateY(0);
      }

      .relay-inline-chip--exiting {
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 200ms ease-in-out, transform 200ms ease-in-out;
      }

      .relay-inline-chip--anchored {
        position: fixed;
      }

      .relay-inline-chip--floating {
        position: fixed;
        right: 16px;
        bottom: 16px;
      }

      .relay-inline-chip__body {
        display: grid;
        gap: 12px;
        padding: 14px;
      }

      .relay-inline-chip__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .relay-inline-chip__label {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(21, 25, 21, 0.54);
      }

      .relay-inline-chip__title {
        margin: 6px 0 0;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
      }

      .relay-inline-chip__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 999px;
        background: rgba(21, 25, 21, 0.06);
        color: rgba(21, 25, 21, 0.72);
        cursor: pointer;
        opacity: 0;
        transition: opacity 160ms ease, background 160ms ease;
      }

      .relay-inline-chip:hover .relay-inline-chip__close,
      .relay-inline-chip:focus-within .relay-inline-chip__close {
        opacity: 1;
      }

      .relay-inline-chip__close:hover {
        background: rgba(21, 25, 21, 0.12);
      }

      .relay-inline-chip__statusRow {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .relay-inline-chip__status {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: rgba(21, 25, 21, 0.8);
      }

      .relay-inline-chip__infoWrap {
        position: relative;
        display: inline-flex;
        margin-top: 1px;
      }

      .relay-inline-chip__info {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border: 1px solid rgba(21, 25, 21, 0.18);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.7);
        color: rgba(21, 25, 21, 0.75);
        font-size: 11px;
        font-weight: 700;
        cursor: help;
      }

      .relay-inline-chip__tooltip {
        position: absolute;
        right: 0;
        top: calc(100% + 8px);
        width: min(260px, calc(100vw - 48px));
        border-radius: 12px;
        background: rgba(17, 21, 18, 0.96);
        color: #f7f5ee;
        padding: 10px 12px;
        font-size: 12px;
        line-height: 1.45;
        box-shadow: 0 18px 36px rgba(10, 12, 11, 0.22);
        opacity: 0;
        pointer-events: none;
        transform: translateY(4px);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      .relay-inline-chip__infoWrap:hover .relay-inline-chip__tooltip,
      .relay-inline-chip__infoWrap:focus-within .relay-inline-chip__tooltip {
        opacity: 1;
        transform: translateY(0);
      }

      .relay-inline-chip__trust {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        font-size: 12px;
        color: rgba(21, 25, 21, 0.58);
      }

      .relay-inline-chip__controls {
        display: grid;
        gap: 10px;
      }

      .relay-inline-chip__row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .relay-inline-chip__button {
        position: relative;
        min-width: 174px;
        border: none;
        border-radius: 999px;
        background: #171b17;
        color: #f7f5ee;
        padding: 11px 16px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease, background 160ms ease;
      }

      .relay-inline-chip__button:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      .relay-inline-chip__button:disabled {
        cursor: default;
        opacity: 0.58;
      }

      .relay-inline-chip__button--loading {
        box-shadow: 0 0 0 6px rgba(23, 27, 23, 0.08);
      }

      .relay-inline-chip__button--success {
        background: #1f7a4c;
        box-shadow: 0 0 0 6px rgba(31, 122, 76, 0.12);
        animation: relay-inline-chip-success 180ms ease-out;
      }

      @keyframes relay-inline-chip-success {
        0% { transform: scale(1); }
        55% { transform: scale(1.03); }
        100% { transform: scale(1); }
      }

      .relay-inline-chip__select {
        width: 100%;
        border: 1px solid rgba(21, 25, 21, 0.12);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.74);
        color: #151915;
        padding: 9px 10px;
        font-size: 13px;
      }

      .relay-inline-chip__shortcut {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
        border-radius: 999px;
        background: rgba(21, 25, 21, 0.06);
        padding: 7px 10px;
        color: rgba(21, 25, 21, 0.7);
        font-size: 12px;
        font-weight: 700;
      }

      .relay-inline-chip__shortcut svg {
        width: 14px;
        height: 14px;
      }
    `

    document.head.appendChild(style)
  }

  function getInlineChipRoot() {
    ensureInlineChipStyles()
    let root = document.getElementById("relay-inline-chip")
    if (!root) {
      root = document.createElement("div")
      root.id = "relay-inline-chip"
      root.className = "relay-inline-chip relay-inline-chip--floating"
      document.body.appendChild(root)
      requestAnimationFrame(() => {
        root.classList.add("relay-inline-chip--visible")
      })
    }

    return root
  }

  function removeInlineChipImmediately() {
    clearChipTimers()
    const root = document.getElementById("relay-inline-chip")
    if (root) {
      root.remove()
    }
  }

  function hideInlineChipWithMotion() {
    clearChipTimers()
    const root = document.getElementById("relay-inline-chip")
    if (!root) return

    root.classList.add("relay-inline-chip--exiting")
    relayChipState.exitTimer = window.setTimeout(() => {
      root.remove()
      relayChipState.exitTimer = null
    }, 210)
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  function setChipPlacement(config, root) {
    const promptTarget = findPrompt(config)

    if (!promptTarget) {
      root.classList.remove("relay-inline-chip--anchored")
      root.classList.add("relay-inline-chip--floating")
      root.style.left = ""
      root.style.top = ""
      return
    }

    const rect = promptTarget.element.getBoundingClientRect()
    const chipWidth = Math.min(root.offsetWidth || 372, window.innerWidth - 32)
    const chipHeight = root.offsetHeight || 200
    const left = clamp(rect.right - chipWidth, 16, Math.max(16, window.innerWidth - chipWidth - 16))

    let top = rect.top - chipHeight - 12
    if (top < 16) {
      top = rect.bottom + 12
    }
    if (top + chipHeight > window.innerHeight - 16) {
      top = Math.max(16, window.innerHeight - chipHeight - 16)
    }

    root.classList.remove("relay-inline-chip--floating")
    root.classList.add("relay-inline-chip--anchored")
    root.style.left = `${Math.round(left)}px`
    root.style.top = `${Math.round(top)}px`
  }

  function getRenderableState() {
    if (isValidActiveProjectState(relayChipState.currentState)) {
      return relayChipState.currentState
    }

    if (relayChipState.pageState && relayChipState.pageState.supported) {
      return buildFallbackState(relayChipState.pageState)
    }

    return null
  }

  function shouldRenderChip(activeState) {
    if (!isValidActiveProjectState(activeState)) return false
    if (!activeState.showCue || !activeState.page.supported) return false
    if (relayChipState.dismissed) return false

    return Boolean(activeState.page.isFreshChat || relayChipState.forcedInsertKind === "quick_continuity")
  }

  function buildRenderKey(activeState) {
    return JSON.stringify({
      href: relayChipState.href,
      dismissed: relayChipState.dismissed,
      forcedInsertKind: relayChipState.forcedInsertKind,
      buttonMode: relayChipState.buttonMode,
      buttonError: relayChipState.buttonError,
      projectId: activeState.projectId,
      projectName: activeState.projectName,
      message: activeState.message,
      status: activeState.status,
      remoteStatus: activeState.remoteStatus,
      issue: activeState.issue?.detail ?? null,
      insertKind: activeState.insertKind,
      canInsert: activeState.canInsert,
      capturePending: activeState.capturePending,
      freshnessText: activeState.freshnessText,
      options: activeState.projectOptions.map((project) => project.id)
    })
  }

  function getButtonLabel(activeState) {
    if (relayChipState.buttonMode === "loading") {
      return "Inserting project brief…"
    }

    if (relayChipState.buttonMode === "success") {
      return "Inserted"
    }

    if (relayChipState.buttonMode === "error" && relayChipState.buttonError) {
      return relayChipState.buttonError
    }

    if (activeState.status === "updating") {
      return "Updating your project brief"
    }

    if (!activeState.canInsert) {
      return "Project brief unavailable"
    }

    return "Insert project brief"
  }

  async function invokeInsertFromChip() {
    const activeState = getRenderableState()
    if (!activeState || !activeState.canInsert) {
      return { ok: false, reason: activeState?.issue?.detail ?? "Project brief unavailable." }
    }

    clearChipTimers()
    relayChipState.buttonMode = "loading"
    relayChipState.buttonError = ""
    renderInlineChip()

    const result = await sendRuntimeMessage({ type: "RELAY_INSERT_PROJECT_BRIEF" })
    if (!result || !result.ok) {
      relayChipState.buttonMode = "error"
      relayChipState.buttonError = result && result.reason ? result.reason : "Insert failed."
      renderInlineChip()
      relayChipState.resetButtonTimer = window.setTimeout(() => {
        relayChipState.buttonMode = "idle"
        relayChipState.buttonError = ""
        renderInlineChip()
      }, 1400)
      return result
    }

    relayChipState.buttonMode = "success"
    relayChipState.buttonError = ""
    renderInlineChip()
    relayChipState.exitTimer = window.setTimeout(() => {
      relayChipState.dismissed = true
      relayChipState.forcedInsertKind = null
      hideInlineChipWithMotion()
      relayChipState.buttonMode = "idle"
    }, 120)

    return result
  }

  function renderInlineChip() {
    const config = getSiteConfig()
    const activeState = getRenderableState()

    if (!config || !activeState || !shouldRenderChip(activeState)) {
      removeInlineChipImmediately()
      return
    }

    const root = getInlineChipRoot()
    const renderKey = buildRenderKey(activeState)
    if (root.dataset.renderKey !== renderKey) {
      const projectOptions = activeState.projectOptions
        .map(
          (project) =>
            `<option value="${escapeHtml(project.id)}"${project.id === activeState.projectId ? " selected" : ""}>${escapeHtml(project.name)}</option>`
        )
        .join("")
      const shouldShowIssue = Boolean(activeState.issue) && (!activeState.canInsert || activeState.remoteStatus === "stale" || activeState.remoteStatus === "unavailable")
      const buttonClassName = [
        "relay-inline-chip__button",
        relayChipState.buttonMode === "loading" ? "relay-inline-chip__button--loading" : "",
        relayChipState.buttonMode === "success" ? "relay-inline-chip__button--success" : ""
      ]
        .filter(Boolean)
        .join(" ")

      root.innerHTML = `
        <div class="relay-inline-chip__body">
          <div class="relay-inline-chip__top">
            <div>
              <p class="relay-inline-chip__label">Current project</p>
              <p class="relay-inline-chip__title">${escapeHtml(activeState.projectName || "Choose a project")}</p>
            </div>
            <button class="relay-inline-chip__close" type="button" aria-label="Dismiss Relay chip">×</button>
          </div>
          <div class="relay-inline-chip__statusRow">
            <p class="relay-inline-chip__status">${escapeHtml(activeState.message || "")}</p>
            ${
              shouldShowIssue
                ? `<div class="relay-inline-chip__infoWrap">
                    <button class="relay-inline-chip__info" type="button" aria-label="Relay issue details">i</button>
                    <div class="relay-inline-chip__tooltip">${escapeHtml(activeState.issue.detail)}</div>
                  </div>`
                : ""
            }
          </div>
          <div class="relay-inline-chip__trust">
            <span>${escapeHtml(activeState.trustLine || "")}</span>
            ${activeState.freshnessText ? `<span>${escapeHtml(activeState.freshnessText)}</span>` : ""}
          </div>
          <div class="relay-inline-chip__controls">
            <div class="relay-inline-chip__row">
              <button class="${buttonClassName}" type="button" ${activeState.canInsert && relayChipState.buttonMode !== "loading" ? "" : "disabled"}>
                ${escapeHtml(getButtonLabel(activeState))}
              </button>
              <div class="relay-inline-chip__shortcut" aria-label="${escapeHtml(activeState.shortcutLabel || "Mod+Shift+I")} shortcut">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3.5" y="5" width="17" height="14" rx="2.8"></rect>
                  <path d="M7.5 10.5h.01M11.5 10.5h.01M15.5 10.5h.01M7.5 14.5h8"></path>
                </svg>
                <span>${escapeHtml(activeState.shortcutLabel || "Mod+Shift+I")}</span>
              </div>
            </div>
            ${
              projectOptions
                ? `<select class="relay-inline-chip__select" aria-label="Current Relay project">${projectOptions}</select>`
                : ""
            }
          </div>
        </div>
      `

      const closeButton = root.querySelector(".relay-inline-chip__close")
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          relayChipState.dismissed = true
          relayChipState.forcedInsertKind = null
          hideInlineChipWithMotion()
        })
      }

      const insertButton = root.querySelector(".relay-inline-chip__button")
      if (insertButton) {
        insertButton.addEventListener("click", async () => {
          await invokeInsertFromChip()
        })
      }

      const select = root.querySelector(".relay-inline-chip__select")
      if (select) {
        select.addEventListener("change", async (event) => {
          const nextProjectId = event.target.value
          if (!nextProjectId) return
          relayChipState.buttonMode = "idle"
          relayChipState.buttonError = ""
          await sendRuntimeMessage({
            type: "RELAY_SET_ACTIVE_PROJECT",
            payload: { projectId: nextProjectId }
          })
        })
      }

      root.dataset.renderKey = renderKey
    }

    if (!root.classList.contains("relay-inline-chip--visible")) {
      requestAnimationFrame(() => {
        root.classList.add("relay-inline-chip--visible")
      })
    }

    root.classList.remove("relay-inline-chip--exiting")
    setChipPlacement(config, root)
  }

  async function pushObservedPageState(force) {
    const nextHref = window.location.href
    if (relayChipState.href !== nextHref) {
      relayChipState.href = nextHref
      relayChipState.dismissed = false
      relayChipState.forcedInsertKind = null
      relayChipState.buttonMode = "idle"
      relayChipState.buttonError = ""
      relayChipState.currentState = null
      relayChipState.lastPageStateKey = ""
      relayChipState.freshCandidateSince = 0
      clearChipTimers()
    }

    const pageState = computePageState(getSiteConfig())
    relayChipState.pageState = pageState
    const nextKey = buildPageStateKey(pageState)

    if (force || relayChipState.lastPageStateKey !== nextKey) {
      relayChipState.lastPageStateKey = nextKey
      await sendRuntimeMessage({
        type: "RELAY_PAGE_STATE_UPDATE",
        payload: pageState
      })
    }

    renderInlineChip()
  }

  function queuePageObservation(force) {
    if (relayChipState.observationTimer !== null) return

    relayChipState.observationTimer = window.setTimeout(() => {
      relayChipState.observationTimer = null
      void pushObservedPageState(force)
    }, 120)
  }

  function markMeaningfulMutation() {
    relayChipState.lastMeaningfulMutationAt = Date.now()
    queuePageObservation(false)
  }

  function scheduleObservation() {
    if (relayChipState.mounted) return
    relayChipState.mounted = true

    queuePageObservation(true)
    const observer = new MutationObserver((mutations) => {
      const shouldReact = mutations.some((mutation) => {
        const target = mutation.target
        if (target instanceof Element && target.closest("#relay-inline-chip")) {
          return false
        }

        return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !(node instanceof Element) || !node.closest("#relay-inline-chip"))
      })

      if (shouldReact) {
        markMeaningfulMutation()
      }
    })

    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    window.addEventListener("focus", () => queuePageObservation(true))
    window.addEventListener("resize", () => queuePageObservation(false))
    window.addEventListener("popstate", () => {
      relayChipState.lastMeaningfulMutationAt = Date.now()
      queuePageObservation(true)
    })
    window.setInterval(() => {
      queuePageObservation(false)
    }, 1000)
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "RELAY_ACTIVE_PROJECT_STATE_CHANGED") {
      relayChipState.currentState = message.payload.state
      renderInlineChip()
      return false
    }

    if (message.type === "RELAY_PAGE_STATE") {
      const pageState = relayChipState.pageState ?? computePageState(getSiteConfig())
      relayChipState.pageState = pageState
      sendResponse(pageState)
      return true
    }

    if (message.type === "RELAY_SHOW_INLINE_CHIP") {
      const pageState = relayChipState.pageState ?? computePageState(getSiteConfig())
      if (!pageState.supported) {
        sendResponse({ ok: false, status: "fallback" })
        return true
      }

      relayChipState.forcedInsertKind = message.payload?.insertKind === "quick_continuity" ? "quick_continuity" : null
      const wasDismissed = relayChipState.dismissed
      relayChipState.dismissed = false
      renderInlineChip()
      void sendRuntimeMessage({ type: "RELAY_GET_ACTIVE_PROJECT_STATE" }).then((state) => {
        if (isValidActiveProjectState(state)) {
          relayChipState.currentState = state
          renderInlineChip()
        }
      })

      sendResponse({
        ok: true,
        status: wasDismissed ? "restored" : document.getElementById("relay-inline-chip") ? "already_visible" : "newly_opened"
      })
      return true
    }

    if (message.type === "RELAY_SHORTCUT_ACTION") {
      const pageState = relayChipState.pageState ?? computePageState(getSiteConfig())
      relayChipState.pageState = pageState

      if (!pageState.supported || pageState.promptReady === false) {
        sendResponse({ ok: true, action: "fallback" })
        return true
      }

      const chipVisible = Boolean(document.getElementById("relay-inline-chip"))
      if (chipVisible) {
        void invokeInsertFromChip()
        sendResponse({ ok: true, action: "invoked_insert" })
        return true
      }

      if (pageState.isFreshChat) {
        const action = relayChipState.dismissed ? "restored" : "opened"
        relayChipState.forcedInsertKind = null
        relayChipState.dismissed = false
        renderInlineChip()
        void sendRuntimeMessage({ type: "RELAY_GET_ACTIVE_PROJECT_STATE" }).then((state) => {
          if (isValidActiveProjectState(state)) {
            relayChipState.currentState = state
            renderInlineChip()
          }
        })
        sendResponse({ ok: true, action })
        return true
      }

      relayChipState.forcedInsertKind = "quick_continuity"
      relayChipState.dismissed = false
      renderInlineChip()
      void sendRuntimeMessage({ type: "RELAY_GET_ACTIVE_PROJECT_STATE" }).then((state) => {
        if (isValidActiveProjectState(state)) {
          relayChipState.currentState = state
          renderInlineChip()
        }
      })
      sendResponse({ ok: true, action: "opened" })
      return true
    }

    if (message.type === "RELAY_CAPTURE_VISIBLE") {
      const config = getSiteConfig()
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
      const config = getSiteConfig()
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
      const config = getSiteConfig()
      if (!config) {
        sendResponse({ ok: false, reason: "Unsupported site." })
        return true
      }

      sendResponse(insertIntoPrompt(config, message.payload.content))
      return true
    }

    return false
  })

  scheduleObservation()
})()
