(function () {
  const PAGE_STABLE_MS = 1800;
  const FRESH_CHAT_STABILIZE_MS = 800;
  const RELAY_THEME_STORAGE_KEY = "relay.themeMode";

  const platformUiConfigs = {
    chatgpt: {
      streamingSelectors: [
        "button[aria-label*='Stop']",
        "[data-testid='stop-button']",
      ],
    },
    codex: {
      streamingSelectors: [
        "button[aria-label*='Stop']",
        "[data-testid='stop-button']",
      ],
    },
    claude: {
      streamingSelectors: ["[data-is-streaming='true']"],
    },
    perplexity: {
      streamingSelectors: [
        "button[aria-label*='Stop']",
        "[data-testid='stop-generating']",
      ],
    },
  };

  const relayChipState = {
    dismissed: false,
    href: window.location.href,
    forcedInsertKind: null,
    projectSwitcherSurface: null,
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
      countdownTimer: null,
      paused: false,
      remainingMs: null,
    },
    themeMode: "system",
    resolvedTheme: window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  };

  function resolveRelayTheme(mode) {
    if (mode === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    return mode === "light" ? "light" : "dark";
  }

  function applyRelayTheme(mode) {
    relayChipState.themeMode = mode;
    relayChipState.resolvedTheme = resolveRelayTheme(mode);
    const chipRoot = document.getElementById("relay-inline-chip");
    if (chipRoot) {
      chipRoot.dataset.theme = relayChipState.resolvedTheme;
    }

    const toastRoot = document.getElementById("relay-association-toast");
    if (toastRoot) {
      toastRoot.dataset.theme = relayChipState.resolvedTheme;
    }
  }

  async function initializeRelayTheme() {
    try {
      const values = await chrome.storage.local.get(RELAY_THEME_STORAGE_KEY);
      const mode = values[RELAY_THEME_STORAGE_KEY];
      applyRelayTheme(
        mode === "light" || mode === "dark" || mode === "system"
          ? mode
          : "system",
      );
    } catch (_error) {
      applyRelayTheme("system");
    }
  }

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

  function getAdapterRuntime() {
    return window.__relayAdapterRuntime || null;
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
    const runtime = getAdapterRuntime();
    const resolved = runtime ? runtime.resolve(window.location.href) : null;

    if (!resolved) {
      return null;
    }

    return {
      platform: resolved.platform,
      streamingSelectors:
        platformUiConfigs[resolved.platform]?.streamingSelectors || [],
    };
  }

  function collectTurns(config) {
    const runtime = getAdapterRuntime();
    return runtime ? runtime.collectTurns(document, window.location.href) : [];
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
    const runtime = getAdapterRuntime();
    const metadata = runtime
      ? runtime.getPageMetadata(document, window.location.href)
      : null;

    if (metadata) {
      return metadata;
    }

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
    const runtime = getAdapterRuntime();
    return runtime ? runtime.findPrompt(document, window.location.href) : null;
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

  async function insertIntoPrompt(config, text) {
    const runtime = getAdapterRuntime();
    return runtime
      ? runtime.insertText(text, document, window.location.href)
      : { ok: false, reason: "Prompt not found." };
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
      associationTier: "none",
      associationToast: {
        visible: false,
        mode: null,
        projectId: null,
        projectName: null,
        projectOptions: [],
        sessionId: null,
        expiresAt: null,
        paused: false,
      },
      associationSuppressed: false,
      insertState: {
        status: "idle",
        source: null,
        message: null,
        updatedAt: null,
      },
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

  function isProjectSwitcherOpen(surface) {
    return relayChipState.projectSwitcherSurface === surface;
  }

  function closeProjectSwitcher() {
    relayChipState.projectSwitcherSurface = null;
  }

  function rerenderSharedSurfaces() {
    renderInlineChip();
    if (relayChipState.associationToast.payload) {
      renderAssociationToast(relayChipState.associationToast.payload);
    }
  }

  function toggleProjectSwitcher(surface) {
    relayChipState.projectSwitcherSurface = isProjectSwitcherOpen(surface)
      ? null
      : surface;
    rerenderSharedSurfaces();
  }

  function ensureInlineChipStyles() {
    if (document.getElementById("relay-inline-chip-styles")) return;

    const style = document.createElement("style");
    style.id = "relay-inline-chip-styles";
    style.textContent = `
      .relay-inline-chip {
        --relay-bg: #1a1a1c;
        --relay-surface: #202022;
        --relay-ink: #e4e4e7;
        --relay-ink-secondary: #b4b4bb;
        --relay-muted: #71717a;
        --relay-faint: #52525b;
        --relay-line: rgba(255, 255, 255, 0.07);
        --relay-accent: #e4e4e7;
        --relay-accent-text: #09090b;
        --relay-hover: rgba(255, 255, 255, 0.08);
        --relay-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
        --relay-tooltip-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        min-width: 280px;
        max-width: min(600px, calc(100vw - 32px));
        border: 1px solid var(--relay-line);
        border-radius: 8px;
        background: var(--relay-bg);
        color: var(--relay-ink);
        box-shadow: var(--relay-shadow);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        overflow: hidden;
        z-index: 2147483000;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 140ms ease-out, transform 140ms ease-out;
      }

      .relay-inline-chip[data-theme="light"] {
        --relay-bg: #f4f1e8;
        --relay-surface: #fffdf7;
        --relay-ink: #191814;
        --relay-ink-secondary: #464136;
        --relay-muted: #7f7768;
        --relay-faint: #a19887;
        --relay-line: rgba(25, 24, 20, 0.1);
        --relay-accent: #191814;
        --relay-accent-text: #f7f4eb;
        --relay-hover: rgba(25, 24, 20, 0.06);
        --relay-shadow: 0 6px 24px rgba(25, 24, 20, 0.16);
        --relay-tooltip-shadow: 0 10px 26px rgba(25, 24, 20, 0.14);
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

      .relay-inline-chip__titleWrap {
        position: relative;
        min-width: 0;
        flex: 1;
      }

      .relay-inline-chip__title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: -0.01em;
      }

      .relay-inline-chip__titleButton {
        width: fit-content;
        max-width: 100%;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: none;
        background: transparent;
        padding: 0;
        color: inherit;
        cursor: pointer;
      }

      .relay-inline-chip__titleLabel {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .relay-inline-chip__titleChevron {
        width: 13px;
        height: 13px;
        color: var(--relay-faint);
        transition: transform 120ms ease, color 120ms ease;
      }

      .relay-inline-chip__titleButton:hover .relay-inline-chip__titleChevron,
      .relay-inline-chip__titleButton:focus-visible .relay-inline-chip__titleChevron {
        color: var(--relay-ink);
      }

      .relay-inline-chip__titleButton[aria-expanded="true"] .relay-inline-chip__titleChevron {
        transform: rotate(180deg);
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
        color: var(--relay-faint);
        font-size: 14px;
        cursor: pointer;
        transition: background 120ms, color 120ms;
      }

      .relay-inline-chip__close:hover {
        background: var(--relay-hover);
        color: var(--relay-ink);
      }

      .relay-inline-chip__statusRow {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .relay-inline-chip__dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 6px;
      }

      .relay-inline-chip__dot--ready {
        background: var(--relay-ink);
      }

      .relay-inline-chip__dot--waiting {
        background: var(--relay-muted);
      }

      .relay-inline-chip__status {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--relay-ink-secondary);
      }

      .relay-inline-chip__statusCopy {
        min-width: 0;
        flex: 1;
        display: inline-flex;
        align-items: flex-start;
        gap: 6px;
        flex-wrap: wrap;
        position: relative;
      }

      .relay-inline-chip__infoWrap {
        position: static;
        display: inline-flex;
        flex: 0 0 auto;
        margin-top: 2px;
      }

      .relay-inline-chip__info {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border: 1px solid var(--relay-line);
        border-radius: 999px;
        background: transparent;
        color: var(--relay-faint);
        font-size: 9px;
        font-weight: 700;
        cursor: help;
      }

      .relay-inline-chip__tooltip {
        position: absolute;
        right: 0;
        top: calc(100% + 6px);
        width: min(220px, calc(100% - 8px));
        max-width: 220px;
        border-radius: 8px;
        background: var(--relay-ink);
        color: var(--relay-accent-text);
        padding: 8px 10px;
        font-size: 11px;
        line-height: 1.45;
        white-space: normal;
        overflow-wrap: anywhere;
        box-shadow: var(--relay-tooltip-shadow);
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
        color: var(--relay-faint);
        line-height: 1.4;
      }

      .relay-inline-chip__controls {
        display: grid;
        gap: 8px;
      }

      .relay-inline-chip__row {
        display: flex;
        align-items: stretch;
        gap: 8px;
      }

      .relay-inline-chip__button {
        position: relative;
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 36px;
        border: none;
        border-radius: 4px;
        background: var(--relay-accent);
        color: var(--relay-accent-text);
        padding: 0 14px;
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
        background: var(--relay-muted);
        color: var(--relay-accent-text);
      }

      .relay-inline-chip__shortcut {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex-shrink: 0;
        min-height: 36px;
        border-radius: 6px;
        border: 1px solid var(--relay-line);
        background: transparent;
        padding: 0 10px;
        color: var(--relay-faint);
        font-size: 11px;
        font-weight: 500;
      }

      .relay-inline-chip__shortcut svg {
        width: 12px;
        height: 12px;
      }

      .relay-inline-chip__projectMenu,
      .relay-association-toast__projectMenu {
        display: grid;
        gap: 6px;
        padding: 8px;
        border: 1px solid var(--relay-line);
        border-radius: 10px;
        background: var(--relay-surface);
      }

      .relay-inline-chip__projectMenu {
        margin-top: 8px;
      }

      .relay-association-toast__projectMenu {
        margin-top: -2px;
      }

      .relay-inline-chip__projectOption,
      .relay-association-toast__projectOption {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: var(--relay-ink);
        padding: 8px 10px;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
        transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
      }

      .relay-inline-chip__projectOption:hover,
      .relay-association-toast__projectOption:hover {
        background: var(--relay-hover);
      }

      .relay-inline-chip__projectOption--active,
      .relay-association-toast__projectOption--active {
        border-color: var(--relay-line);
        background: var(--relay-hover);
      }

      @keyframes relay-shimmer {
        0% { background-position: 200% center; }
        100% { background-position: -200% center; }
      }

      .relay-inline-chip__button--loading {
        opacity: 1;
        background: var(--relay-accent);
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
        --relay-bg: rgba(26, 26, 28, 0.94);
        --relay-surface: #202022;
        --relay-ink: #e4e4e7;
        --relay-ink-secondary: #b4b4bb;
        --relay-muted: #71717a;
        --relay-faint: #52525b;
        --relay-line: rgba(255, 255, 255, 0.07);
        --relay-accent: #e4e4e7;
        --relay-accent-text: #09090b;
        --relay-hover: rgba(255, 255, 255, 0.08);
        --relay-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
        position: fixed;
        top: 18px;
        right: 18px;
        display: grid;
        gap: 10px;
        min-width: 220px;
        max-width: min(340px, calc(100vw - 36px));
        padding: 12px 14px 12px 14px;
        border: 1px solid var(--relay-line);
        border-radius: 14px;
        background: var(--relay-bg);
        color: var(--relay-ink);
        box-shadow: var(--relay-shadow);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        z-index: 2147483001;
        opacity: 0;
        transform: translateY(-8px);
        transition: opacity 160ms ease, transform 160ms ease;
      }

      .relay-association-toast[data-theme="light"] {
        --relay-bg: rgba(255, 253, 247, 0.97);
        --relay-surface: #fffdf7;
        --relay-ink: #191814;
        --relay-ink-secondary: #464136;
        --relay-muted: #7f7768;
        --relay-faint: #a19887;
        --relay-line: rgba(25, 24, 20, 0.1);
        --relay-accent: #191814;
        --relay-accent-text: #f7f4eb;
        --relay-hover: rgba(25, 24, 20, 0.06);
        --relay-shadow: 0 14px 32px rgba(25, 24, 20, 0.16);
      }

      .relay-association-toast--visible {
        opacity: 1;
        transform: translateY(0);
      }

      .relay-association-toast--hiding {
        opacity: 0;
        transform: translateY(-10px);
      }

      .relay-association-toast--clickable {
        cursor: pointer;
      }

      .relay-association-toast__title {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
      }

      .relay-association-toast__titleWrap {
        min-width: 0;
        flex: 1;
        display: grid;
        gap: 8px;
      }

      .relay-association-toast__titleButton {
        width: fit-content;
        max-width: 100%;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: none;
        background: transparent;
        padding: 0;
        color: inherit;
        cursor: pointer;
      }

      .relay-association-toast__titleLabel {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .relay-association-toast__titleChevron {
        width: 12px;
        height: 12px;
        color: var(--relay-muted);
        transition: transform 120ms ease, color 120ms ease;
      }

      .relay-association-toast__titleButton:hover .relay-association-toast__titleChevron,
      .relay-association-toast__titleButton:focus-visible .relay-association-toast__titleChevron {
        color: var(--relay-ink);
      }

      .relay-association-toast__titleButton[aria-expanded="true"] .relay-association-toast__titleChevron {
        transform: rotate(180deg);
      }

      .relay-association-toast__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .relay-association-toast__dismiss {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: var(--relay-muted);
        font-size: 14px;
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease;
      }

      .relay-association-toast__dismiss:hover:not(:disabled) {
        background: var(--relay-hover);
        color: var(--relay-ink);
      }

      .relay-association-toast__meta {
        margin: 0;
        font-size: 11px;
        line-height: 1.45;
        color: var(--relay-ink-secondary);
      }

      .relay-association-toast__actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .relay-association-toast__button {
        width: fit-content;
        border: 1px solid var(--relay-line);
        border-radius: 999px;
        background: transparent;
        color: var(--relay-ink);
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
      }

      .relay-association-toast__button:hover:not(:disabled) {
        opacity: 0.9;
      }

      .relay-association-toast__button:disabled,
      .relay-association-toast__dismiss:disabled {
        cursor: default;
        opacity: 0.45;
      }

      .relay-association-toast__button--primary {
        background: var(--relay-accent);
        color: var(--relay-accent-text);
      }

      .relay-association-toast__button--loading {
        opacity: 1;
      }

      .relay-association-toast__button--subtle {
        color: var(--relay-ink-secondary);
      }

      .relay-association-toast__timer,
      .relay-association-toast__resume {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--relay-line);
        border-radius: 999px;
        background: transparent;
        color: var(--relay-muted);
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
      }

      .relay-association-toast__timer {
        margin-left: auto;
        min-width: 52px;
        padding: 4px 10px;
      }

      .relay-association-toast__timer:hover {
        background: var(--relay-hover);
        color: var(--relay-ink);
      }

      .relay-association-toast__countdown {
        font-size: 11px;
        color: inherit;
      }

      .relay-association-toast__timer-row {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .relay-association-toast__timer-state {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--relay-ink-secondary);
      }

      .relay-association-toast__timer-state svg,
      .relay-association-toast__resume svg {
        width: 11px;
        height: 11px;
      }

      .relay-association-toast__resume {
        width: 28px;
        height: 28px;
      }

      .relay-association-toast__resume:hover {
        background: var(--relay-hover);
        color: var(--relay-ink);
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

    root.dataset.theme = relayChipState.resolvedTheme;

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
      chipProjectSwitcherOpen: isProjectSwitcherOpen("chip"),
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
      associationStatus: activeState.chatAssociation.status,
      associationProjectId: activeState.chatAssociation.projectId,
      associationProjectName: activeState.chatAssociation.projectName,
      insertStatus: activeState.insertState?.status ?? "idle",
      insertMessage: activeState.insertState?.message ?? null,
    });
  }

  function getInsertUiState(activeState) {
    const sharedInsertState = activeState.insertState || {
      status: "idle",
      message: null,
    };

    if (sharedInsertState.status === "inserting") {
      return {
        mode: "loading",
        message: '<span class="relay-inline-chip__shimmer">Inserting project brief…</span>',
      };
    }

    if (sharedInsertState.status === "inserted") {
      return {
        mode: "success",
        message: "Inserted",
      };
    }

    if (sharedInsertState.status === "error" && sharedInsertState.message) {
      return {
        mode: "error",
        message: escapeHtml(sharedInsertState.message),
      };
    }

    if (relayChipState.buttonMode === "loading") {
      return {
        mode: "loading",
        message: '<span class="relay-inline-chip__shimmer">Inserting project brief…</span>',
      };
    }

    if (relayChipState.buttonMode === "success") {
      return {
        mode: "success",
        message: "Inserted",
      };
    }

    if (relayChipState.buttonMode === "error" && relayChipState.buttonError) {
      return {
        mode: "error",
        message: escapeHtml(relayChipState.buttonError),
      };
    }

    if (activeState.status === "updating") {
      return {
        mode: "idle",
        message: "Updating your project brief",
      };
    }

    if (!activeState.canInsert) {
      return {
        mode: "idle",
        message: "Project brief unavailable",
      };
    }

    return {
      mode: "idle",
      message: "Insert project brief",
    };
  }

  function getButtonLabel(activeState) {
    return getInsertUiState(activeState).message;
  }

  function syncSharedInsertState(activeState) {
    const insertState = activeState?.insertState;
    if (!insertState || insertState.status === "idle") {
      relayChipState.buttonMode = "idle";
      relayChipState.buttonError = "";
      return;
    }

    if (insertState.status === "inserting") {
      relayChipState.buttonMode = "loading";
      relayChipState.buttonError = "";
      return;
    }

    if (insertState.status === "inserted") {
      relayChipState.buttonMode = "success";
      relayChipState.buttonError = "";
      return;
    }

    relayChipState.buttonMode = "error";
    relayChipState.buttonError = insertState.message || "Insert failed.";
  }

  function buildAssociationToastPayloadFromState(activeState) {
    const toastState = activeState?.associationToast;
    if (
      !toastState ||
      !toastState.visible ||
      !toastState.mode ||
      !toastState.projectId ||
      !toastState.projectName ||
      !toastState.expiresAt
    ) {
      return null;
    }

    return {
      mode: toastState.mode,
      projectId: toastState.projectId,
      projectName: toastState.projectName,
      projectOptions:
        toastState.projectOptions?.length > 0
          ? toastState.projectOptions
          : activeState.projectOptions || [],
      sessionId: toastState.sessionId || null,
      expiresAt: toastState.expiresAt,
    };
  }

  function syncAssociationToastFromState(activeState) {
    const payload = buildAssociationToastPayloadFromState(activeState);

    if (!payload) {
      if (relayChipState.associationToast.payload) {
        hideAssociationToast();
      }
      return;
    }

    relayChipState.associationToast.paused =
      activeState.associationToast?.paused === true;
    if (!relayChipState.associationToast.paused) {
      relayChipState.associationToast.remainingMs = null;
    }
    renderAssociationToast(payload);
  }

  function formatProjectSwitcherOptions(projectOptions, activeProjectId, className) {
    return projectOptions
      .map((project) => {
        const active = project.id === activeProjectId;
        return `
          <button
            class="${className}${active ? ` ${className}--active` : ""}"
            type="button"
            data-project-id="${escapeHtml(project.id)}"
          >
            <span>${escapeHtml(project.name)}</span>
            <span>${active ? "Current" : "Switch"}</span>
          </button>
        `;
      })
      .join("");
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
      payload: {
        source: "inline_chip",
      },
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

  function dismissInlineChip(source) {
    emitInlineTelemetry({
      level: "info",
      area: "chip",
      event:
        source === "keyboard"
          ? "inline_chip.dismissed_escape"
          : "inline_chip.dismissed",
      message:
        source === "keyboard"
          ? "Dismissed the inline chip with Escape."
          : "Dismissed the inline chip.",
    });
    relayChipState.dismissed = true;
    relayChipState.forcedInsertKind = null;
    hideInlineChipWithMotion();
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
      const shouldShowIssue =
        Boolean(activeState.issue) &&
        (!activeState.canInsert ||
          activeState.remoteStatus === "stale" ||
          activeState.remoteStatus === "unavailable");
      const insertUiState = getInsertUiState(activeState);
      const projectSwitcherOpen = isProjectSwitcherOpen("chip");
      const buttonClassName = [
        "relay-inline-chip__button",
        insertUiState.mode === "loading"
          ? "relay-inline-chip__button--loading"
          : "",
        insertUiState.mode === "success"
          ? "relay-inline-chip__button--success"
          : "",
        insertUiState.mode === "error"
          ? "relay-inline-chip__button--loading"
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      const dotClass = activeState.canInsert
        ? "relay-inline-chip__dot--ready"
        : "relay-inline-chip__dot--waiting";
      const chipTitle =
        activeState.projectOptions.length > 1
          ? `
            <div class="relay-inline-chip__titleWrap">
              <button
                class="relay-inline-chip__titleButton"
                type="button"
                aria-label="Switch project"
                aria-expanded="${projectSwitcherOpen ? "true" : "false"}"
              >
                <span class="relay-inline-chip__title relay-inline-chip__titleLabel">${escapeHtml(activeState.projectName || "No project")}</span>
                <svg class="relay-inline-chip__titleChevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="4 6 8 10 12 6"></polyline>
                </svg>
              </button>
              ${
                projectSwitcherOpen
                  ? `<div class="relay-inline-chip__projectMenu">${formatProjectSwitcherOptions(activeState.projectOptions, activeState.projectId, "relay-inline-chip__projectOption")}</div>`
                  : ""
              }
            </div>
          `
          : `<div class="relay-inline-chip__titleWrap"><p class="relay-inline-chip__title">${escapeHtml(activeState.projectName || "No project")}</p></div>`;

      root.innerHTML = `
        <div class="relay-inline-chip__body">
          <div class="relay-inline-chip__top">
            ${chipTitle}
            <button class="relay-inline-chip__close" type="button" aria-label="Dismiss">×</button>
          </div>
          <div class="relay-inline-chip__statusRow">
            <span class="relay-inline-chip__dot ${dotClass}"></span>
            <div class="relay-inline-chip__statusCopy">
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
              <button class="${buttonClassName}" type="button" ${activeState.canInsert && insertUiState.mode !== "loading" ? "" : "disabled"}>
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
          </div>
        </div>
      `;

      const closeButton = root.querySelector(".relay-inline-chip__close");
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          dismissInlineChip("button");
        });
      }

      const insertButton = root.querySelector(".relay-inline-chip__button");
      if (insertButton) {
        insertButton.addEventListener("click", async () => {
          await invokeInsertFromChip();
        });
      }

      const titleButton = root.querySelector(".relay-inline-chip__titleButton");
      if (titleButton) {
        titleButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleProjectSwitcher("chip");
        });
      }

      root.querySelectorAll(".relay-inline-chip__projectOption").forEach((button) => {
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const nextProjectId = button.getAttribute("data-project-id");
          if (!nextProjectId) return;
          const associationAware =
            activeState.chatAssociation &&
            ["pending", "held", "saved"].includes(
              activeState.chatAssociation.status,
            );
          emitInlineTelemetry({
            level: "info",
            area: "project",
            event: associationAware
              ? "inline_association.retarget"
              : "inline_project.switch",
            message: associationAware
              ? "Retargeted the chat association from the inline chip."
              : "Switched the active project from the inline chip.",
            context: {
              projectId: nextProjectId,
            },
          });
          relayChipState.buttonMode = "idle";
          relayChipState.buttonError = "";
          closeProjectSwitcher();
          await sendRuntimeMessage(
            associationAware
              ? {
                  type: "RELAY_SET_CHAT_ASSOCIATION_PROJECT",
                  payload: {
                    projectId: nextProjectId,
                    source: "inline_chip",
                  },
                }
              : {
                  type: "RELAY_SET_ACTIVE_PROJECT",
                  payload: { projectId: nextProjectId },
                },
          );
        });
      });

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
    if (toastState.countdownTimer !== null) {
      window.clearInterval(toastState.countdownTimer);
      toastState.countdownTimer = null;
    }
  }

  function getAssociationToastKey(payload) {
    return payload ? `${payload.mode}:${payload.projectId}` : "";
  }

  function getAssociationToastRemainingMs(payload) {
    if (relayChipState.associationToast.remainingMs !== null) {
      return Math.max(0, relayChipState.associationToast.remainingMs);
    }

    return Math.max(0, payload.expiresAt - Date.now());
  }

  function resetAssociationToastPauseState() {
    relayChipState.associationToast.paused = false;
    relayChipState.associationToast.remainingMs = null;
  }

  function hideAssociationToast() {
    clearAssociationToastTimers();
    const root = document.getElementById("relay-association-toast");
    if (isProjectSwitcherOpen("toast")) {
      closeProjectSwitcher();
    }
    resetAssociationToastPauseState();
    if (!root) {
      relayChipState.associationToast.payload = null;
      return;
    }

    root.classList.add("relay-association-toast--hiding");
    relayChipState.associationToast.removeTimer = window.setTimeout(() => {
      root.remove();
      relayChipState.associationToast.removeTimer = null;
      relayChipState.associationToast.payload = null;
      resetAssociationToastPauseState();
    }, 180);
  }

  function formatToastCountdown(expiresAt) {
    return `${Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))}s`;
  }

  function updateAssociationToastCountdown(root, payload) {
    const countdown = root.querySelector(".relay-association-toast__countdown");
    if (!countdown) return;

    countdown.textContent = formatToastCountdown(payload.expiresAt);
  }

  function pauseIconMarkup() {
    return `
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="4" y="3" width="2.5" height="10" rx="1.25" fill="currentColor"></rect>
        <rect x="9.5" y="3" width="2.5" height="10" rx="1.25" fill="currentColor"></rect>
      </svg>
    `;
  }

  function playIconMarkup() {
    return `
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M5 3.5L12 8L5 12.5V3.5Z" fill="currentColor"></path>
      </svg>
    `;
  }

  function renderAssociationToastTimer(payload) {
    if (relayChipState.associationToast.paused) {
      return `
        <div class="relay-association-toast__timer-row">
          <span class="relay-association-toast__timer-state">
            ${pauseIconMarkup()}
            Paused
          </span>
          <button class="relay-association-toast__resume" type="button" aria-label="Resume association toast timer">
            ${playIconMarkup()}
          </button>
        </div>
      `;
    }

    return `
      <button class="relay-association-toast__timer" type="button" aria-label="${
        payload.mode === "auto_save"
          ? "Pause auto-save timer"
          : "Pause association toast timer"
      }">
        <span class="relay-association-toast__countdown">${formatToastCountdown(payload.expiresAt)}</span>
      </button>
    `;
  }

  function setAssociationToastPending(root, payload) {
    root.dataset.pendingAction = "approve";
    const meta = root.querySelector(".relay-association-toast__meta");
    if (meta) {
      meta.textContent = `Saving this chat to ${payload.projectName}…`;
    }

    const buttons = root.querySelectorAll(
      ".relay-association-toast__button, .relay-association-toast__dismiss",
    );
    buttons.forEach((button) => {
      button.disabled = true;
    });

    const approveButton = root.querySelector('[data-action="approve"]');
    if (approveButton) {
      approveButton.textContent = "Approving…";
      approveButton.classList.add("relay-association-toast__button--loading");
    }

    const countdown = root.querySelector(".relay-association-toast__countdown");
    if (countdown) {
      countdown.textContent = "Saving…";
    }
  }

  async function setAssociationToastPaused(root, payload, paused) {
    if (root.dataset.pendingAction) {
      return;
    }

    const remainingMs = getAssociationToastRemainingMs(payload);
    relayChipState.associationToast.remainingMs = remainingMs;
    relayChipState.associationToast.paused = paused;
    clearAssociationToastTimers();

    if (payload.mode === "auto_save") {
      const response = await sendRuntimeMessage({
        type: "RELAY_SET_ASSOCIATION_TOAST_PAUSED",
        payload: {
          paused,
          mode: payload.mode,
          projectId: payload.projectId,
        },
      });

      if (response?.ok === false) {
        relayChipState.associationToast.remainingMs = null;
        relayChipState.associationToast.paused = false;
        renderAssociationToast(payload);
        return;
      }

      if (typeof response?.expiresAt === "number") {
        payload = {
          ...payload,
          expiresAt: response.expiresAt,
        };
      } else if (!paused) {
        payload = {
          ...payload,
          expiresAt: Date.now() + remainingMs,
        };
      }
    } else if (!paused) {
      payload = {
        ...payload,
        expiresAt: Date.now() + remainingMs,
      };
    }

    if (!paused) {
      relayChipState.associationToast.remainingMs = null;
    }

    renderAssociationToast(payload);
  }

  function renderAssociationToast(payload) {
    ensureInlineChipStyles();
    const previousPayload = relayChipState.associationToast.payload;
    if (getAssociationToastKey(previousPayload) !== getAssociationToastKey(payload)) {
      resetAssociationToastPauseState();
    }
    relayChipState.associationToast.payload = payload;
    clearAssociationToastTimers();

    let root = document.getElementById("relay-association-toast");
    if (!root) {
      root = document.createElement("div");
      root.id = "relay-association-toast";
      root.className = "relay-association-toast";
      document.body.appendChild(root);
    }
    root.dataset.theme = relayChipState.resolvedTheme;
    delete root.dataset.pendingAction;

    const title =
      payload.mode === "auto_save"
        ? `Saving to ${payload.projectName}`
        : `Approve save to ${payload.projectName}`;
    const meta =
      payload.mode === "auto_save"
        ? "Relay is 100% sure about this chat. Cancel if this association is wrong."
        : "Relay is not fully sure. Approve now or review it later in the sidebar.";
    const toastProjectSwitcherOpen = isProjectSwitcherOpen("toast");
    const titleMarkup =
      payload.projectOptions && payload.projectOptions.length > 1
        ? `
          <div class="relay-association-toast__titleWrap">
            <button
              class="relay-association-toast__titleButton"
              type="button"
              aria-label="Switch association project"
              aria-expanded="${toastProjectSwitcherOpen ? "true" : "false"}"
            >
              <span class="relay-association-toast__title relay-association-toast__titleLabel">${escapeHtml(title)}</span>
              <svg class="relay-association-toast__titleChevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="4 6 8 10 12 6"></polyline>
              </svg>
            </button>
            ${
              toastProjectSwitcherOpen
                ? `<div class="relay-association-toast__projectMenu">${formatProjectSwitcherOptions(payload.projectOptions, payload.projectId, "relay-association-toast__projectOption")}</div>`
                : ""
            }
          </div>
        `
        : `<p class="relay-association-toast__title">${escapeHtml(title)}</p>`;

    root.classList.toggle(
      "relay-association-toast--clickable",
      payload.mode === "held_review",
    );
    root.innerHTML = `
      <div class="relay-association-toast__header">
        ${titleMarkup}
        <button class="relay-association-toast__dismiss" type="button" aria-label="Dismiss association toast">×</button>
      </div>
      <p class="relay-association-toast__meta">${escapeHtml(meta)}</p>
      <div class="relay-association-toast__actions">
        ${
          payload.mode === "auto_save"
            ? '<button class="relay-association-toast__button" type="button" data-action="cancel">Cancel save</button>'
            : '<button class="relay-association-toast__button relay-association-toast__button--primary" type="button" data-action="approve">Approve save</button><button class="relay-association-toast__button relay-association-toast__button--subtle" type="button" data-action="cancel">Not this chat</button>'
        }
        ${renderAssociationToastTimer(payload)}
      </div>
    `;

    root.onclick = null;
    if (payload.mode === "held_review") {
      root.onclick = () => {
        sendRuntimeMessage({ type: "RELAY_OPEN_SIDE_PANEL" });
        hideAssociationToast();
      };
    }

    const titleButton = root.querySelector(".relay-association-toast__titleButton");
    if (titleButton) {
      titleButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleProjectSwitcher("toast");
      });
    }

    root.querySelectorAll(".relay-association-toast__projectOption").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (root.dataset.pendingAction) {
          return;
        }

        const nextProjectId = button.getAttribute("data-project-id");
        if (!nextProjectId || nextProjectId === payload.projectId) {
          return;
        }

        const response = await sendRuntimeMessage({
          type: "RELAY_SET_CHAT_ASSOCIATION_PROJECT",
          payload: {
            projectId: nextProjectId,
            source: "toast",
          },
        });

        if (!response?.ok) {
          renderAssociationToast(payload);
          return;
        }

        closeProjectSwitcher();
        renderAssociationToast({
          ...payload,
          projectId: response.projectId ?? nextProjectId,
          projectName: response.projectName ?? payload.projectName,
          projectOptions: response.state?.projectOptions ?? payload.projectOptions,
        });
      });
    });

    root.querySelectorAll("[data-action]").forEach((actionButton) => {
      actionButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = actionButton.getAttribute("data-action");
        if (!action || root.dataset.pendingAction) {
          return;
        }

        if (action === "approve") {
          setAssociationToastPending(root, payload);
        }

        const response = await sendRuntimeMessage({
          type: "RELAY_RESOLVE_ASSOCIATION_TOAST",
          payload: {
            action,
            mode: payload.mode,
            projectId: payload.projectId,
          },
        });

        if (response?.ok === false && action === "approve") {
          renderAssociationToast(payload);
          return;
        }

        hideAssociationToast();
      });
    });

    const dismissButton = root.querySelector(".relay-association-toast__dismiss");
    if (dismissButton) {
      dismissButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (root.dataset.pendingAction) {
          return;
        }

        await sendRuntimeMessage({
          type: "RELAY_RESOLVE_ASSOCIATION_TOAST",
          payload: {
            action: "cancel",
            mode: payload.mode,
            projectId: payload.projectId,
          },
        });
        hideAssociationToast();
      });
    }

    requestAnimationFrame(() => {
      root.classList.remove("relay-association-toast--hiding");
      root.classList.add("relay-association-toast--visible");
    });

    const timerButton = root.querySelector(".relay-association-toast__timer");
    if (timerButton) {
      timerButton.addEventListener("mouseenter", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!relayChipState.associationToast.paused) {
          void setAssociationToastPaused(root, payload, true);
        }
      });
      timerButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }

    const resumeButton = root.querySelector(".relay-association-toast__resume");
    if (resumeButton) {
      resumeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void setAssociationToastPaused(root, payload, false);
      });
    }

    if (!relayChipState.associationToast.paused) {
      updateAssociationToastCountdown(root, payload);
      relayChipState.associationToast.countdownTimer = window.setInterval(() => {
        updateAssociationToastCountdown(root, payload);
      }, 250);
      relayChipState.associationToast.hideTimer = window.setTimeout(() => {
        hideAssociationToast();
      }, Math.max(0, payload.expiresAt - Date.now()));
    }
  }

  async function pushObservedPageState(force) {
    const nextHref = window.location.href;
    if (relayChipState.href !== nextHref) {
      relayChipState.href = nextHref;
      relayChipState.dismissed = false;
      relayChipState.forcedInsertKind = null;
      closeProjectSwitcher();
      relayChipState.buttonMode = "idle";
      relayChipState.buttonError = "";
      relayChipState.currentState = null;
      relayChipState.lastPageStateKey = "";
      relayChipState.freshCandidateSince = 0;
      clearChipTimers();
      hideAssociationToast();
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
    window.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        document.getElementById("relay-inline-chip")
      ) {
        event.preventDefault();
        dismissInlineChip("keyboard");
      }
    });
    window.addEventListener("focus", () => queuePageObservation(false));
    window.addEventListener("pointerdown", (event) => {
      if (!relayChipState.projectSwitcherSurface) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".relay-inline-chip__titleButton") ||
        target.closest(".relay-inline-chip__projectMenu") ||
        target.closest(".relay-association-toast__titleButton") ||
        target.closest(".relay-association-toast__projectMenu")
      ) {
        return;
      }

      closeProjectSwitcher();
      rerenderSharedSurfaces();
    });
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
      syncSharedInsertState(message.payload.state);
      syncAssociationToastFromState(message.payload.state);
      renderInlineChip();
      return false;
    }

    if (message.type === "RELAY_EXTENSION_THEME_CHANGED") {
      applyRelayTheme(message.payload?.theme || "system");
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
            syncSharedInsertState(state);
            syncAssociationToastFromState(state);
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
      closeProjectSwitcher();
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
            syncSharedInsertState(state);
            syncAssociationToastFromState(state);
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
            syncSharedInsertState(state);
            syncAssociationToastFromState(state);
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

      void insertIntoPrompt(config, message.payload.content).then(sendResponse);
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

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (relayChipState.themeMode === "system") {
        applyRelayTheme("system");
      }
    });

  void initializeRelayTheme();
  scheduleObservation();
})();
