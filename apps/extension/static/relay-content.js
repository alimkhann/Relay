(function () {
  const PAGE_STABLE_MS = 1800;
  const FRESH_CHAT_STABILIZE_MS = 800;

  const siteConfigs = [
    {
      platform: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"],
      turnSelectors: ["[data-message-author-role]"],
      promptSelectors: [
        "#prompt-textarea",
        "form #prompt-textarea",
        "form [contenteditable='true']",
        "form textarea",
        "main textarea",
      ],
      streamingSelectors: [
        "button[aria-label*='Stop']",
        "[data-testid='stop-button']",
      ],
      getRole(node) {
        return node.getAttribute("data-message-author-role") || "unknown";
      },
    },
    {
      platform: "codex",
      hosts: ["codex.openai.com"],
      turnSelectors: ["[data-message-author-role]"],
      promptSelectors: [
        "#prompt-textarea",
        "form #prompt-textarea",
        "form [contenteditable='true']",
        "form textarea",
        "main textarea",
      ],
      streamingSelectors: [
        "button[aria-label*='Stop']",
        "[data-testid='stop-button']",
      ],
      getRole(node) {
        return node.getAttribute("data-message-author-role") || "unknown";
      },
    },
    {
      platform: "claude",
      hosts: ["claude.ai"],
      turnSelectors: [
        "[data-is-streaming]",
        "main [data-testid='message-human']",
        "main [data-testid='message-assistant']",
      ],
      promptSelectors: ["div[contenteditable='true']", "textarea"],
      streamingSelectors: ["[data-is-streaming='true']"],
      getRole(node) {
        return node.getAttribute("data-testid") === "message-human"
          ? "user"
          : "assistant";
      },
    },
    {
      platform: "perplexity",
      hosts: ["www.perplexity.ai", "perplexity.ai"],
      turnSelectors: [
        "main [data-testid='answer']",
        "main [data-testid='query']",
        "main article",
      ],
      promptSelectors: ["textarea", "[contenteditable='true']"],
      streamingSelectors: [
        "button[aria-label*='Stop']",
        "[data-testid='stop-generating']",
      ],
      getRole(node) {
        return node.getAttribute("data-testid") === "query"
          ? "user"
          : "assistant";
      },
    },
  ];

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
    mounted: false,
    associationToast: {
      payload: null,
      hideTimer: null,
      removeTimer: null,
    },
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeText(input) {
    return (input || "").replace(/\s+/g, " ").trim();
  }

  function cleanTurnContent(input) {
    return normalizeText(input)
      .replace(/^You said:\s*/i, "")
      .replace(/^ChatGPT said:\s*/i, "")
      .replace(/^Claude said:\s*/i, "")
      .replace(/^Codex said:\s*/i, "");
  }

  function computeSignature(turns, metadata, platform) {
    const payload = JSON.stringify({
      platform,
      url: metadata.url,
      pageFingerprint: metadata.pageFingerprint,
      turns: turns.map((turn) => ({
        role: turn.role,
        content: turn.content,
        turnIndex: turn.turnIndex,
      })),
    });

    let hash = 0;
    for (let index = 0; index < payload.length; index += 1) {
      hash = (hash << 5) - hash + payload.charCodeAt(index);
      hash |= 0;
    }

    return String(hash);
  }

  function getSiteConfig() {
    const hostname = window.location.hostname;
    return (
      siteConfigs.find((config) => config.hosts.includes(hostname)) || null
    );
  }

  function collectTurns(config) {
    const seenNodes = new Set();
    const seenContent = new Set();
    const turns = [];

    for (const selector of config.turnSelectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (seenNodes.has(node)) continue;
        seenNodes.add(node);

        const role = config.getRole(node);
        const content = cleanTurnContent(node.textContent);
        if (!content || role === "unknown") continue;

        const contentKey = `${role}:${content.toLowerCase()}`;
        if (seenContent.has(contentKey)) continue;
        seenContent.add(contentKey);

        turns.push({
          role,
          content,
          turnIndex: turns.length,
          rawHtml: node.innerHTML || null,
        });
      }
    }

    return turns;
  }

  function getLatestMeaningfulUserTurnText(turns) {
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (turn.role !== "user") continue;
      if (!turn.content || turn.content.length < 8) continue;
      return turn.content.slice(0, 280);
    }

    return null;
  }

  function getPageMetadata() {
    const url = new URL(window.location.href);
    return {
      title: document.title || null,
      url: url.toString(),
      pathname: url.pathname,
      pageFingerprint: url.pathname.split("/").filter(Boolean).pop() || null,
      domain: url.hostname,
    };
  }

  function findPrompt(config) {
    for (const selector of config.promptSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));

      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          !element.hasAttribute("disabled");

        if (!isVisible) continue;

        return {
          element,
          isContentEditable: Boolean(element.isContentEditable),
        };
      }
    }

    return null;
  }

  function readPromptText(target) {
    if (target.isContentEditable) {
      return normalizeText(target.element.textContent);
    }

    if ("value" in target.element) {
      return normalizeText(target.element.value);
    }

    return "";
  }

  function insertIntoPrompt(config, text) {
    const target = findPrompt(config);
    if (!target) {
      return { ok: false, reason: "Prompt not found." };
    }

    const element = target.element;
    const expected = normalizeText(text);

    if (target.isContentEditable) {
      element.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);

      let inserted = false;
      if (typeof document.execCommand === "function") {
        inserted = document.execCommand("insertText", false, text);
      }

      if (!inserted) {
        const html = text
          .split("\n")
          .map((line) => `<p>${line ? escapeHtml(line) : "<br>"}</p>`)
          .join("");

        element.innerHTML = html;
      }

      element.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          data: text,
          inputType: "insertText",
        }),
      );
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: text,
          inputType: "insertText",
        }),
      );
      element.dispatchEvent(new Event("change", { bubbles: true }));

      return readPromptText(target).includes(expected)
        ? { ok: true }
        : {
            ok: false,
            reason: "Prompt editor did not accept the inserted text.",
          };
    }

    if ("value" in element) {
      element.focus();
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : element instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : null;

      const descriptor = prototype
        ? Object.getOwnPropertyDescriptor(prototype, "value")
        : null;
      if (descriptor && typeof descriptor.set === "function") {
        descriptor.set.call(element, text);
      } else {
        element.value = text;
      }
      element.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          data: text,
          inputType: "insertText",
        }),
      );
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: text,
          inputType: "insertText",
        }),
      );
      element.dispatchEvent(new Event("change", { bubbles: true }));

      return readPromptText(target).includes(expected)
        ? { ok: true }
        : {
            ok: false,
            reason: "Prompt textarea did not accept the inserted text.",
          };
    }

    return { ok: false, reason: "No editable prompt field found." };
  }

  function hasStreamingActivity(config) {
    return config.streamingSelectors.some((selector) =>
      document.querySelector(selector),
    );
  }

  function inferFreshRoute(config, metadata) {
    const pathname = metadata.pathname || "/";

    if (config.platform === "claude") {
      return pathname.includes("/new");
    }

    return pathname === "/";
  }

  function computePageState(config) {
    if (!config) {
      return { supported: false };
    }

    const turns = collectTurns(config);
    const metadata = getPageMetadata();
    const promptTarget = findPrompt(config);
    const isFreshRoute = inferFreshRoute(config, metadata);
    const promptReady = Boolean(promptTarget);
    const candidateFresh = isFreshRoute && promptReady && turns.length === 0;

    if (!candidateFresh) {
      relayChipState.freshCandidateSince = 0;
    } else if (!relayChipState.freshCandidateSince) {
      relayChipState.freshCandidateSince = Date.now();
    }

    const isStable =
      Date.now() - relayChipState.lastMeaningfulMutationAt >= PAGE_STABLE_MS;
    const isFreshChat =
      candidateFresh &&
      Date.now() - relayChipState.freshCandidateSince >=
        FRESH_CHAT_STABILIZE_MS;

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
      recentUserTurnText: getLatestMeaningfulUserTurnText(turns),
      promptReady,
      isFreshRoute,
      isFreshChat,
      isStable,
      isStreaming: hasStreamingActivity(config),
    };
  }

  function buildPageStateKey(pageState) {
    return JSON.stringify({
      supported: pageState.supported,
      url: pageState.url,
      turns: pageState.turns,
      captureSignature: pageState.captureSignature,
      recentUserTurnText: pageState.recentUserTurnText,
      promptReady: pageState.promptReady,
      isFreshRoute: pageState.isFreshRoute,
      isFreshChat: pageState.isFreshChat,
      isStable: pageState.isStable,
      isStreaming: pageState.isStreaming,
    });
  }

  function buildFallbackState(pageState) {
    return {
      projectId: null,
      projectName: "Checking project",
      projectOptions: [],
      viewState: "connected-loading",
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
        savedContextCount: 0,
      },
      remoteStatus: "loading",
      issue: null,
      insertKind: pageState.isFreshChat
        ? "fresh_chat_bootstrap"
        : "quick_continuity",
      lastSuccessfulSyncAt: null,
      capturePending: false,
      contextPreview: {
        decisions: [],
        constraints: [],
        tasks: [],
      },
      chatAssociation: {
        status: "none",
        projectId: null,
        projectName: null,
        sessionId: null,
        reason: null,
        capturedAt: null,
      },
      routingReview: null,
    };
  }

  function isValidActiveProjectState(state) {
    return Boolean(
      state &&
      typeof state === "object" &&
      state.page &&
      typeof state.page.supported === "boolean" &&
      Array.isArray(state.projectOptions),
    );
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        resolve(response);
      });
    });
  }

  function createFlowId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function emitInlineTelemetry(payload) {
    try {
      chrome.runtime.sendMessage({
        type: "RELAY_LOG_TELEMETRY",
        payload: {
          surface: "extension-inline-chip",
          url: window.location.pathname,
          timestamp: new Date().toISOString(),
          ...payload,
        },
      });
    } catch (_error) {
      // Best-effort logging only.
    }
  }

  function clearChipTimers() {
    if (relayChipState.exitTimer !== null) {
      window.clearTimeout(relayChipState.exitTimer);
      relayChipState.exitTimer = null;
    }

    if (relayChipState.resetButtonTimer !== null) {
      window.clearTimeout(relayChipState.resetButtonTimer);
      relayChipState.resetButtonTimer = null;
    }
  }

  function ensureInlineChipStyles() {
    if (document.getElementById("relay-inline-chip-styles")) return;

    const style = document.createElement("style");
    style.id = "relay-inline-chip-styles";
    style.textContent = `
      .relay-inline-chip {
        min-width: 280px;
        max-width: min(600px, calc(100vw - 32px));
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 8px;
        background: #1a1a1c;
        color: #e4e4e7;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        overflow: hidden;
        z-index: 2147483000;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 140ms ease-out, transform 140ms ease-out;
      }

      .relay-inline-chip--visible {
        opacity: 1;
        transform: translateY(0);
      }

      .relay-inline-chip--exiting {
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 180ms ease-in-out, transform 180ms ease-in-out;
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
        gap: 10px;
        padding: 8px 12px;
      }

      .relay-inline-chip__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .relay-inline-chip__title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: -0.01em;
      }

      .relay-inline-chip__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #52525b;
        font-size: 14px;
        cursor: pointer;
        transition: background 120ms, color 120ms;
      }

      .relay-inline-chip__close:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #e4e4e7;
      }

      .relay-inline-chip__statusRow {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .relay-inline-chip__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .relay-inline-chip__dot--ready {
        background: #e4e4e7;
      }

      .relay-inline-chip__dot--waiting {
        background: #71717a;
      }

      .relay-inline-chip__status {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: #b4b4bb;
      }

      .relay-inline-chip__infoWrap {
        position: relative;
        display: inline-flex;
        margin-left: auto;
      }

      .relay-inline-chip__info {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 999px;
        background: transparent;
        color: #52525b;
        font-size: 10px;
        font-weight: 700;
        cursor: help;
      }

      .relay-inline-chip__tooltip {
        position: absolute;
        right: 0;
        top: calc(100% + 6px);
        width: min(240px, calc(100vw - 48px));
        border-radius: 8px;
        background: #e4e4e7;
        color: #09090b;
        padding: 8px 10px;
        font-size: 11px;
        line-height: 1.45;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        opacity: 0;
        pointer-events: none;
        transform: translateY(3px);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      .relay-inline-chip__infoWrap:hover .relay-inline-chip__tooltip,
      .relay-inline-chip__infoWrap:focus-within .relay-inline-chip__tooltip {
        opacity: 1;
        transform: translateY(0);
      }

      .relay-inline-chip__trust {
        font-size: 11px;
        color: #52525b;
        line-height: 1.4;
      }

      .relay-inline-chip__controls {
        display: grid;
        gap: 8px;
      }

      .relay-inline-chip__row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .relay-inline-chip__button {
        position: relative;
        flex: 1;
        min-width: 0;
        border: none;
        border-radius: 4px;
        background: #e4e4e7;
        color: #09090b;
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 120ms, opacity 120ms;
      }

      .relay-inline-chip__button:hover:not(:disabled) {
        opacity: 0.9;
      }

      .relay-inline-chip__button:disabled {
        cursor: default;
        opacity: 0.4;
      }

      .relay-inline-chip__button--loading {
        opacity: 0.7;
      }

      .relay-inline-chip__button--success {
        background: #71717a;
        color: #09090b;
      }

      .relay-inline-chip__shortcut {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        background: transparent;
        padding: 6px 8px;
        color: #52525b;
        font-size: 11px;
        font-weight: 500;
      }

      .relay-inline-chip__shortcut svg {
        width: 12px;
        height: 12px;
      }

      .relay-inline-chip__select {
        width: 100%;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 8px;
        background: #202022;
        color: #e4e4e7;
        padding: 7px 10px;
        font-size: 12px;
        font-family: inherit;
      }

      @keyframes relay-shimmer {
        0% { background-position: 200% center; }
        100% { background-position: -200% center; }
      }

      .relay-inline-chip__button--loading {
        opacity: 1;
        background: #e4e4e7;
      }

      .relay-inline-chip__shimmer {
        background: linear-gradient(90deg, #09090b 0%, #09090b 30%, rgba(255,255,255,0.6) 50%, #09090b 70%, #09090b 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: relay-shimmer 2s ease-in-out infinite;
      }

      .relay-association-toast {
        position: fixed;
        top: 22px;
        right: 0;
        display: grid;
        gap: 8px;
        min-width: 220px;
        max-width: min(320px, calc(100vw - 24px));
        padding: 12px 14px 12px 16px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-right: none;
        border-radius: 16px 0 0 16px;
        background: rgba(26, 26, 28, 0.94);
        color: #e4e4e7;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        z-index: 2147483001;
        opacity: 0;
        transform: translateX(12px);
        transition: opacity 160ms ease, transform 160ms ease;
        cursor: pointer;
      }

      .relay-association-toast--visible {
        opacity: 1;
        transform: translateX(0);
      }

      .relay-association-toast--hiding {
        opacity: 0;
        transform: translateX(14px);
      }

      .relay-association-toast__title {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
      }

      .relay-association-toast__meta {
        margin: 0;
        font-size: 11px;
        line-height: 1.45;
        color: #b4b4bb;
      }

      .relay-association-toast__cancel {
        width: fit-content;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 999px;
        background: transparent;
        color: #e4e4e7;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 600;
        opacity: 0;
        pointer-events: none;
        transform: translateY(-2px);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      .relay-association-toast:hover .relay-association-toast__cancel,
      .relay-association-toast:focus-within .relay-association-toast__cancel {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
    `;

    document.head.appendChild(style);
  }

  function getInlineChipRoot() {
    ensureInlineChipStyles();
    let root = document.getElementById("relay-inline-chip");
    if (!root) {
      root = document.createElement("div");
      root.id = "relay-inline-chip";
      root.className = "relay-inline-chip relay-inline-chip--floating";
      document.body.appendChild(root);
      requestAnimationFrame(() => {
        root.classList.add("relay-inline-chip--visible");
      });
    }

    return root;
  }

  function removeInlineChipImmediately() {
    clearChipTimers();
    const root = document.getElementById("relay-inline-chip");
    if (root) {
      root.remove();
    }
  }

  function hideInlineChipWithMotion() {
    clearChipTimers();
    const root = document.getElementById("relay-inline-chip");
    if (!root) return;

    root.classList.add("relay-inline-chip--exiting");
    relayChipState.exitTimer = window.setTimeout(() => {
      root.remove();
      relayChipState.exitTimer = null;
    }, 210);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setChipPlacement(config, root) {
    const promptTarget = findPrompt(config);

    if (!promptTarget) {
      root.classList.remove("relay-inline-chip--anchored");
      root.classList.add("relay-inline-chip--floating");
      root.style.left = "";
      root.style.top = "";
      root.style.width = "";
      return;
    }

    const rect = promptTarget.element.getBoundingClientRect();
    const dynamicWidth = clamp(rect.width, 280, Math.min(600, window.innerWidth - 32));
    root.style.width = `${Math.round(dynamicWidth)}px`;
    const chipHeight = root.offsetHeight || 200;
    const left = clamp(
      rect.left + (rect.width - dynamicWidth) / 2,
      16,
      Math.max(16, window.innerWidth - dynamicWidth - 16),
    );

    let top = rect.top - chipHeight - 12;
    if (top < 16) {
      top = rect.bottom + 12;
    }
    if (top + chipHeight > window.innerHeight - 16) {
      top = Math.max(16, window.innerHeight - chipHeight - 16);
    }

    root.classList.remove("relay-inline-chip--floating");
    root.classList.add("relay-inline-chip--anchored");
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  }

  function getRenderableState() {
    if (isValidActiveProjectState(relayChipState.currentState)) {
      return relayChipState.currentState;
    }

    if (relayChipState.pageState && relayChipState.pageState.supported) {
      return buildFallbackState(relayChipState.pageState);
    }

    return null;
  }

  function shouldRenderChip(activeState) {
    if (!isValidActiveProjectState(activeState)) return false;
    if (!activeState.showCue || !activeState.page.supported) return false;
    if (relayChipState.dismissed) return false;

    return Boolean(
      activeState.page.isFreshChat ||
      relayChipState.forcedInsertKind === "quick_continuity",
    );
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
      options: activeState.projectOptions.map((project) => project.id),
    });
  }

  function getButtonLabel(activeState) {
    if (relayChipState.buttonMode === "loading") {
      return '<span class="relay-inline-chip__shimmer">Inserting project brief…</span>';
    }

    if (relayChipState.buttonMode === "success") {
      return "Inserted";
    }

    if (relayChipState.buttonMode === "error" && relayChipState.buttonError) {
      return escapeHtml(relayChipState.buttonError);
    }

    if (activeState.status === "updating") {
      return "Updating your project brief";
    }

    if (!activeState.canInsert) {
      return "Project brief unavailable";
    }

    return "Insert project brief";
  }

  async function invokeInsertFromChip() {
    const activeState = getRenderableState();
    const flowId = createFlowId("chip-insert");
    if (!activeState || !activeState.canInsert) {
      emitInlineTelemetry({
        level: "warn",
        area: "insert",
        event: "inline_insert.unavailable",
        flowId,
        message: activeState?.issue?.detail ?? "Project brief unavailable.",
      });
      return {
        ok: false,
        reason: activeState?.issue?.detail ?? "Project brief unavailable.",
      };
    }

    clearChipTimers();
    relayChipState.buttonMode = "loading";
    relayChipState.buttonError = "";
    renderInlineChip();

    const result = await sendRuntimeMessage({
      type: "RELAY_INSERT_PROJECT_BRIEF",
    });
    if (!result || !result.ok) {
      emitInlineTelemetry({
        level: "error",
        area: "insert",
        event: "inline_insert.failed",
        flowId,
        message:
          result && result.reason ? result.reason : "Insert failed from inline chip.",
        context: {
          projectId: activeState.projectId,
        },
      });
      relayChipState.buttonMode = "error";
      relayChipState.buttonError =
        result && result.reason ? result.reason : "Insert failed.";
      renderInlineChip();
      relayChipState.resetButtonTimer = window.setTimeout(() => {
        relayChipState.buttonMode = "idle";
        relayChipState.buttonError = "";
        renderInlineChip();
      }, 1400);
      return result;
    }

    relayChipState.buttonMode = "success";
    relayChipState.buttonError = "";
    renderInlineChip();
    relayChipState.exitTimer = window.setTimeout(() => {
      relayChipState.dismissed = true;
      relayChipState.forcedInsertKind = null;
      hideInlineChipWithMotion();
      relayChipState.buttonMode = "idle";
    }, 120);

    emitInlineTelemetry({
      level: "info",
      area: "insert",
      event: "inline_insert.succeeded",
      flowId,
      message: "Inserted project brief from the inline chip.",
      context: {
        projectId: activeState.projectId,
        projectName: activeState.projectName,
      },
    });

    return result;
  }

  function renderInlineChip() {
    const config = getSiteConfig();
    const activeState = getRenderableState();

    if (!config || !activeState || !shouldRenderChip(activeState)) {
      removeInlineChipImmediately();
      return;
    }

    const root = getInlineChipRoot();
    const renderKey = buildRenderKey(activeState);
    if (root.dataset.renderKey !== renderKey) {
      const projectOptions = activeState.projectOptions
        .map(
          (project) =>
            `<option value="${escapeHtml(project.id)}"${project.id === activeState.projectId ? " selected" : ""}>${escapeHtml(project.name)}</option>`,
        )
        .join("");
      const shouldShowIssue =
        Boolean(activeState.issue) &&
        (!activeState.canInsert ||
          activeState.remoteStatus === "stale" ||
          activeState.remoteStatus === "unavailable");
      const buttonClassName = [
        "relay-inline-chip__button",
        relayChipState.buttonMode === "loading"
          ? "relay-inline-chip__button--loading"
          : "",
        relayChipState.buttonMode === "success"
          ? "relay-inline-chip__button--success"
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      const dotClass = activeState.canInsert
        ? "relay-inline-chip__dot--ready"
        : "relay-inline-chip__dot--waiting";

      root.innerHTML = `
        <div class="relay-inline-chip__body">
          <div class="relay-inline-chip__top">
            <p class="relay-inline-chip__title">${escapeHtml(activeState.projectName || "No project")}</p>
            <button class="relay-inline-chip__close" type="button" aria-label="Dismiss">×</button>
          </div>
          <div class="relay-inline-chip__statusRow">
            <span class="relay-inline-chip__dot ${dotClass}"></span>
            <p class="relay-inline-chip__status">${escapeHtml(activeState.message || "")}</p>
            ${
              shouldShowIssue
                ? `<div class="relay-inline-chip__infoWrap">
                    <button class="relay-inline-chip__info" type="button" aria-label="Details">i</button>
                    <div class="relay-inline-chip__tooltip">${escapeHtml(activeState.issue.detail)}</div>
                  </div>`
                : ""
            }
          </div>
          <div class="relay-inline-chip__trust">
            ${
              activeState.trust &&
              (activeState.trust.recentChatCount > 0 ||
                activeState.trust.savedContextCount > 0)
                ? `<span>${activeState.trust.recentChatCount} chats · ${activeState.trust.savedContextCount} saved</span>`
                : `<span>${escapeHtml(activeState.trustLine || "")}</span>`
            }${activeState.freshnessText ? ` · <span>${escapeHtml(activeState.freshnessText)}</span>` : ""}
          </div>
          <div class="relay-inline-chip__controls">
            <div class="relay-inline-chip__row">
              <button class="${buttonClassName}" type="button" ${activeState.canInsert && relayChipState.buttonMode !== "loading" ? "" : "disabled"}>
                ${getButtonLabel(activeState)}
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
              activeState.projectOptions.length > 1
                ? `<select class="relay-inline-chip__select" aria-label="Switch project">${projectOptions}</select>`
                : ""
            }
          </div>
        </div>
      `;

      const closeButton = root.querySelector(".relay-inline-chip__close");
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          emitInlineTelemetry({
            level: "info",
            area: "chip",
            event: "inline_chip.dismissed",
            message: "Dismissed the inline chip.",
          });
          relayChipState.dismissed = true;
          relayChipState.forcedInsertKind = null;
          hideInlineChipWithMotion();
        });
      }

      const insertButton = root.querySelector(".relay-inline-chip__button");
      if (insertButton) {
        insertButton.addEventListener("click", async () => {
          await invokeInsertFromChip();
        });
      }

      const select = root.querySelector(".relay-inline-chip__select");
      if (select) {
        select.addEventListener("change", async (event) => {
          const nextProjectId = event.target.value;
          if (!nextProjectId) return;
          emitInlineTelemetry({
            level: "info",
            area: "project",
            event: "inline_project.switch",
            message: "Switched the active project from the inline chip.",
            context: {
              projectId: nextProjectId,
            },
          });
          relayChipState.buttonMode = "idle";
          relayChipState.buttonError = "";
          await sendRuntimeMessage({
            type: "RELAY_SET_ACTIVE_PROJECT",
            payload: { projectId: nextProjectId },
          });
        });
      }

      root.dataset.renderKey = renderKey;
    }

    if (!root.classList.contains("relay-inline-chip--visible")) {
      requestAnimationFrame(() => {
        root.classList.add("relay-inline-chip--visible");
      });
    }

    root.classList.remove("relay-inline-chip--exiting");
    setChipPlacement(config, root);
  }

  function clearAssociationToastTimers() {
    const toastState = relayChipState.associationToast;
    if (toastState.hideTimer !== null) {
      window.clearTimeout(toastState.hideTimer);
      toastState.hideTimer = null;
    }
    if (toastState.removeTimer !== null) {
      window.clearTimeout(toastState.removeTimer);
      toastState.removeTimer = null;
    }
  }

  function hideAssociationToast() {
    clearAssociationToastTimers();
    const root = document.getElementById("relay-association-toast");
    if (!root) return;

    root.classList.add("relay-association-toast--hiding");
    relayChipState.associationToast.removeTimer = window.setTimeout(() => {
      root.remove();
      relayChipState.associationToast.removeTimer = null;
      relayChipState.associationToast.payload = null;
    }, 180);
  }

  function renderAssociationToast(payload) {
    ensureInlineChipStyles();
    relayChipState.associationToast.payload = payload;
    clearAssociationToastTimers();

    let root = document.getElementById("relay-association-toast");
    if (!root) {
      root = document.createElement("div");
      root.id = "relay-association-toast";
      root.className = "relay-association-toast";
      document.body.appendChild(root);
    }

    root.innerHTML = `
      <p class="relay-association-toast__title">Saved to ${escapeHtml(payload.projectName)}</p>
      <p class="relay-association-toast__meta">Open the dashboard or cancel this association.</p>
      <button class="relay-association-toast__cancel" type="button">Cancel save</button>
    `;

    root.onclick = () => {
      sendRuntimeMessage({ type: "RELAY_OPEN_SIDE_PANEL" });
      hideAssociationToast();
    };

    const cancelButton = root.querySelector(".relay-association-toast__cancel");
    if (cancelButton) {
      cancelButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await sendRuntimeMessage({
          type: "RELAY_SET_CHAT_ASSOCIATION_ARCHIVED",
          payload: {
            projectId: payload.projectId,
            sessionId: payload.sessionId,
            archived: true,
          },
        });
        hideAssociationToast();
      });
    }

    requestAnimationFrame(() => {
      root.classList.remove("relay-association-toast--hiding");
      root.classList.add("relay-association-toast--visible");
    });

    relayChipState.associationToast.hideTimer = window.setTimeout(() => {
      hideAssociationToast();
    }, 5000);
  }

  async function pushObservedPageState(force) {
    const nextHref = window.location.href;
    if (relayChipState.href !== nextHref) {
      relayChipState.href = nextHref;
      relayChipState.dismissed = false;
      relayChipState.forcedInsertKind = null;
      relayChipState.buttonMode = "idle";
      relayChipState.buttonError = "";
      relayChipState.currentState = null;
      relayChipState.lastPageStateKey = "";
      relayChipState.freshCandidateSince = 0;
      clearChipTimers();
    }

    const pageState = computePageState(getSiteConfig());
    relayChipState.pageState = pageState;
    const nextKey = buildPageStateKey(pageState);

    if (force || relayChipState.lastPageStateKey !== nextKey) {
      relayChipState.lastPageStateKey = nextKey;
      await sendRuntimeMessage({
        type: "RELAY_PAGE_STATE_UPDATE",
        payload: pageState,
      });
    }

    renderInlineChip();
  }

  function queuePageObservation(force) {
    if (relayChipState.observationTimer !== null) return;

    relayChipState.observationTimer = window.setTimeout(() => {
      relayChipState.observationTimer = null;
      void pushObservedPageState(force);
    }, 120);
  }

  function markMeaningfulMutation() {
    relayChipState.lastMeaningfulMutationAt = Date.now();
    queuePageObservation(false);
  }

  function scheduleObservation() {
    if (relayChipState.mounted) return;
    relayChipState.mounted = true;

    queuePageObservation(true);
    const observer = new MutationObserver((mutations) => {
      const shouldReact = mutations.some((mutation) => {
        const target = mutation.target;
        if (target instanceof Element && target.closest("#relay-inline-chip")) {
          return false;
        }

        return [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) =>
            !(node instanceof Element) || !node.closest("#relay-inline-chip"),
        );
      });

      if (shouldReact) {
        markMeaningfulMutation();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    window.addEventListener("focus", () => queuePageObservation(true));
    window.addEventListener("resize", () => queuePageObservation(false));
    window.addEventListener("popstate", () => {
      relayChipState.lastMeaningfulMutationAt = Date.now();
      queuePageObservation(true);
    });
    window.setInterval(() => {
      queuePageObservation(false);
    }, 1000);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "RELAY_ACTIVE_PROJECT_STATE_CHANGED") {
      relayChipState.currentState = message.payload.state;
      renderInlineChip();
      return false;
    }

    if (message.type === "RELAY_PAGE_STATE") {
      const pageState =
        relayChipState.pageState ?? computePageState(getSiteConfig());
      relayChipState.pageState = pageState;
      sendResponse(pageState);
      return true;
    }

    if (message.type === "RELAY_SHOW_INLINE_CHIP") {
      const pageState =
        relayChipState.pageState ?? computePageState(getSiteConfig());
      if (!pageState.supported) {
        sendResponse({ ok: false, status: "fallback" });
        return true;
      }

      relayChipState.forcedInsertKind =
        message.payload?.insertKind === "quick_continuity"
          ? "quick_continuity"
          : null;
      const wasDismissed = relayChipState.dismissed;
      relayChipState.dismissed = false;
      renderInlineChip();
      emitInlineTelemetry({
        level: "info",
        area: "chip",
        event: "inline_chip.shown",
        message: "Requested to show the inline chip.",
        context: {
          restored: wasDismissed,
          insertKind:
            message.payload?.insertKind === "quick_continuity"
              ? "quick_continuity"
              : "fresh_chat_bootstrap",
        },
      });
      void sendRuntimeMessage({ type: "RELAY_GET_ACTIVE_PROJECT_STATE" }).then(
        (state) => {
          if (isValidActiveProjectState(state)) {
            relayChipState.currentState = state;
            renderInlineChip();
          }
        },
      );

      sendResponse({
        ok: true,
        status: wasDismissed
          ? "restored"
          : document.getElementById("relay-inline-chip")
            ? "already_visible"
            : "newly_opened",
      });
      return true;
    }

    if (message.type === "RELAY_SHOW_ASSOCIATION_TOAST") {
      renderAssociationToast(message.payload);
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === "RELAY_SHORTCUT_ACTION") {
      const pageState =
        relayChipState.pageState ?? computePageState(getSiteConfig());
      relayChipState.pageState = pageState;

      if (!pageState.supported || pageState.promptReady === false) {
        sendResponse({ ok: true, action: "fallback" });
        return true;
      }

      const chipVisible = Boolean(document.getElementById("relay-inline-chip"));
      if (chipVisible) {
        emitInlineTelemetry({
          level: "info",
          area: "shortcut",
          event: "inline_chip.shortcut_insert",
          message: "Shortcut triggered project brief insertion from a visible chip.",
        });
        void invokeInsertFromChip();
        sendResponse({ ok: true, action: "invoked_insert" });
        return true;
      }

      if (pageState.isFreshChat) {
        const action = relayChipState.dismissed ? "restored" : "opened";
        emitInlineTelemetry({
          level: "info",
          area: "shortcut",
          event: "inline_chip.shortcut_opened",
          message: "Shortcut opened the inline chip on a fresh chat.",
          context: {
            action,
          },
        });
        relayChipState.forcedInsertKind = null;
        relayChipState.dismissed = false;
        renderInlineChip();
        void sendRuntimeMessage({
          type: "RELAY_GET_ACTIVE_PROJECT_STATE",
        }).then((state) => {
          if (isValidActiveProjectState(state)) {
            relayChipState.currentState = state;
            renderInlineChip();
          }
        });
        sendResponse({ ok: true, action });
        return true;
      }

      relayChipState.forcedInsertKind = "quick_continuity";
      relayChipState.dismissed = false;
      emitInlineTelemetry({
        level: "info",
        area: "shortcut",
        event: "inline_chip.shortcut_quick_continuity",
        message: "Shortcut opened the inline chip in quick continuity mode.",
      });
      renderInlineChip();
      void sendRuntimeMessage({ type: "RELAY_GET_ACTIVE_PROJECT_STATE" }).then(
        (state) => {
          if (isValidActiveProjectState(state)) {
            relayChipState.currentState = state;
            renderInlineChip();
          }
        },
      );
      sendResponse({ ok: true, action: "opened" });
      return true;
    }

    if (message.type === "RELAY_CAPTURE_VISIBLE") {
      const config = getSiteConfig();
      if (!config) {
        sendResponse({ ok: false, reason: "Unsupported site." });
        return true;
      }

      const turns = collectTurns(config);
      const metadata = getPageMetadata();

      sendResponse({
        ok: true,
        capture: {
          platform: config.platform,
          session: {
            title: metadata.title,
            url: metadata.url,
            pageFingerprint: metadata.pageFingerprint,
            captureSignature: computeSignature(
              turns,
              metadata,
              config.platform,
            ),
            metadata: {
              domain: metadata.domain,
              pathname: metadata.pathname,
            },
          },
          turns,
        },
      });
      return true;
    }

    if (message.type === "RELAY_GET_SELECTION") {
      const config = getSiteConfig();
      if (!config) {
        sendResponse({ ok: false, reason: "Unsupported site." });
        return true;
      }

      const text = normalizeText(
        window.getSelection ? window.getSelection().toString() : "",
      );
      if (!text) {
        sendResponse({ ok: false, reason: "Select text in the page first." });
        return true;
      }

      const metadata = getPageMetadata();
      sendResponse({
        ok: true,
        text,
        platform: config.platform,
        metadata: {
          url: metadata.url,
          title: metadata.title,
          pathname: metadata.pathname,
        },
      });
      return true;
    }

    if (message.type === "RELAY_INSERT_CONTEXT") {
      const config = getSiteConfig();
      if (!config) {
        sendResponse({ ok: false, reason: "Unsupported site." });
        return true;
      }

      sendResponse(insertIntoPrompt(config, message.payload.content));
      return true;
    }

    return false;
  });

  window.addEventListener("error", (event) => {
    emitInlineTelemetry({
      level: "error",
      area: "runtime",
      event: "inline_chip.error",
      message: event.message || "Unhandled content-script error.",
      error: event.error ? { message: String(event.error.message || event.error), stack: event.error.stack || null } : { message: event.message || "Unhandled content-script error." },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    emitInlineTelemetry({
      level: "error",
      area: "runtime",
      event: "inline_chip.unhandled_rejection",
      message: "Unhandled content-script promise rejection.",
      error: { message: String(event.reason) },
    });
  });

  scheduleObservation();
})();
