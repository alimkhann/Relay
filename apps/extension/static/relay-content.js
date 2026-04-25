(function () {
  const PAGE_STABLE_MS = 1800;
  const POST_STREAMING_STABLE_MS = 800;
  const FRESH_CHAT_STABILIZE_MS = 800;
  const RELAY_THEME_STORAGE_KEY = "relay.themeMode";

  // Diagnostic: confirm content script loaded on this page
  console.debug("[Relay] Content script loaded on", window.location.href);

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
    gemini: {
      streamingSelectors: [
        "button[aria-label*='Stop']",
        "[data-testid='stop-button']",
        "mat-icon[data-mat-icon-name='stop_circle']",
      ],
    },
    grok: {
      streamingSelectors: [
        "button[aria-label*='Stop']",
        "[data-testid='stop-button']",
      ],
    },
    deepseek: {
      streamingSelectors: ["button[aria-label*='Stop']", ".stop-generating"],
    },
  };

  const relayChipState = {
    dismissed: false,
    forcedVisible: false,
    href: window.location.href,
    forcedInsertKind: null,
    projectSwitcherSurface: null,
    observationTimer: null,
    stabilityRecheckTimer: null,
    lastMeaningfulMutationAt: Date.now(),
    lastContentChangeAt: Date.now(),
    lastContentStabilityKey: "",
    freshCandidateSince: 0,
    lastPageStateKey: "",
    pageState: null,
    currentState: null,
    buttonMode: "idle",
    buttonError: "",
    exitTimer: null,
    resetButtonTimer: null,
    mounted: false,
    wasStreaming: false,
    streamingEndedAt: 0,
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

  // ─── Network capture cache ───────────────────────────────────────────
  // Populated by MAIN world network-intercept via window.postMessage.
  // Keyed by platform so we always have the latest full conversation.
  const networkCaptureCache = {
    /** @type {{ platform: string, conversationId: string|null, title: string|null, url: string, turns: Array<{role: string, content: string, turnIndex: number}>, capturedAt: number } | null} */
    latest: null,
    /** Stale after 60 seconds — forces DOM fallback if network data is old */
    maxAgeMs: 60000,
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

  function resolveCaptureIdentity(metadata, sourceConversationId) {
    return sourceConversationId || metadata.pageFingerprint || metadata.url;
  }

  function computeSignature(turns, metadata, platform, sourceConversationId) {
    const payload = JSON.stringify({
      platform,
      identity: resolveCaptureIdentity(metadata, sourceConversationId),
      turns: turns.map((turn) => ({
        role: turn.role,
        content: normalizeText(turn.content),
      })),
    });

    let hash = 0;
    for (let index = 0; index < payload.length; index += 1) {
      hash = (hash << 5) - hash + payload.charCodeAt(index);
      hash |= 0;
    }

    return String(hash);
  }

  function detectPlatformFromUrl(url) {
    if (
      /codex\.openai\.com/.test(url) ||
      /chatgpt\.com\/codex|chat\.openai\.com\/codex/.test(url)
    )
      return "codex";
    if (/chatgpt\.com|chat\.openai\.com/.test(url)) return "chatgpt";
    if (/claude\.ai/.test(url)) return "claude";
    if (/perplexity\.ai/.test(url)) return "perplexity";
    if (/gemini\.google\.com|aistudio\.google\.com/.test(url)) return "gemini";
    if (/grok\.com|x\.com\/i\/grok/.test(url)) return "grok";
    if (/chat\.deepseek\.com/.test(url)) return "deepseek";
    return null;
  }

  function getSiteConfig() {
    const runtime = getAdapterRuntime();
    const resolved = runtime ? runtime.resolve(window.location.href) : null;

    const platform = resolved
      ? resolved.platform
      : detectPlatformFromUrl(window.location.href);

    if (!platform) {
      return null;
    }

    return {
      platform,
      streamingSelectors: platformUiConfigs[platform]?.streamingSelectors || [],
    };
  }

  function collectTurns(config, metadata) {
    const runtime = getAdapterRuntime();
    const domTurns = runtime
      ? runtime.collectTurns(document, window.location.href)
      : [];

    // Try to merge with network-captured turns for completeness
    const merged = mergeNetworkAndDomTurns(domTurns, config, metadata);
    return merged;
  }

  /**
   * Merge network-intercepted turns with DOM-scraped turns.
   *
   * Strategy:
   * - If network data is available and fresh, use it as the base
   *   (it has ALL turns, not just the ones visible in the virtual-scrolled DOM).
   * - For turns that exist in both, prefer network for content completeness
   *   but keep DOM rawHtml if present.
   * - If network data is stale or missing, fall back to DOM-only.
   */
  function mergeNetworkAndDomTurns(domTurns, config, metadata) {
    var cache = networkCaptureCache.latest;
    if (!cache) return tagTurnsWithSource(domTurns, "dom");

    // Check freshness
    var age = Date.now() - cache.capturedAt;
    if (age > networkCaptureCache.maxAgeMs) {
      return tagTurnsWithSource(domTurns, "dom");
    }

    // Check platform matches
    if (cache.platform !== config.platform) {
      return tagTurnsWithSource(domTurns, "dom");
    }

    var currentConversationId = getConversationIdentity(
      config.platform,
      metadata,
    );
    if (
      cache.conversationId &&
      currentConversationId &&
      cache.conversationId !== currentConversationId
    ) {
      return tagTurnsWithSource(domTurns, "dom");
    }

    if (cache.url && metadata && metadata.url) {
      try {
        var cacheUrl = new URL(cache.url);
        var currentUrl = new URL(metadata.url);
        if (
          cacheUrl.hostname === currentUrl.hostname &&
          cacheUrl.pathname !== currentUrl.pathname &&
          !cache.conversationId &&
          !currentConversationId
        ) {
          return tagTurnsWithSource(domTurns, "dom");
        }
      } catch (_error) {
        // Fall through to the existing checks.
      }
    }

    var networkTurns = cache.turns;
    if (!networkTurns || networkTurns.length === 0) {
      return tagTurnsWithSource(domTurns, "dom");
    }

    // If DOM has more or equal turns, it's likely already complete
    // (e.g. short conversation that fits in viewport)
    if (domTurns.length >= networkTurns.length) {
      return tagTurnsWithSource(domTurns, "dom");
    }

    // Network has more turns — use network as base, enrich with DOM formatting
    // Build a lookup of DOM turns by normalized content prefix for matching
    var domByIndex = {};
    for (var i = 0; i < domTurns.length; i++) {
      var dt = domTurns[i];
      if (dt && dt.turnIndex != null) {
        domByIndex[dt.turnIndex] = dt;
      }
    }

    // Also build a content-prefix lookup for fuzzy matching
    var domByPrefix = {};
    for (var j = 0; j < domTurns.length; j++) {
      var dtp = domTurns[j];
      if (dtp && dtp.content) {
        var prefix = normalizeText(dtp.content).slice(0, 80);
        if (prefix.length >= 10) {
          domByPrefix[prefix] = dtp;
        }
      }
    }

    var merged = [];
    for (var k = 0; k < networkTurns.length; k++) {
      var nt = networkTurns[k];
      if (!nt) continue;

      // Try to find matching DOM turn
      var contentPrefix = normalizeText(nt.content || "").slice(0, 80);
      var domMatch = domByPrefix[contentPrefix] || null;

      merged.push({
        role: nt.role,
        content: nt.content,
        turnIndex: k,
        rawHtml: domMatch ? domMatch.rawHtml : null,
        captureSource: domMatch ? "merged" : "network",
      });
    }

    console.debug(
      "[Relay] Merged network+DOM turns:",
      networkTurns.length,
      "network,",
      domTurns.length,
      "DOM →",
      merged.length,
      "merged",
    );

    return merged;
  }

  var CAPTURE_LIMITS = {
    maxTurnContent: 120000,
    maxRawHtml: 250000,
    maxTurns: 500,
  };

  function sanitizeTurnsForCapture(turns) {
    var capped = turns.slice(0, CAPTURE_LIMITS.maxTurns);
    return capped.map(function (t) {
      var sanitized = Object.assign({}, t);
      if (
        typeof sanitized.content === "string" &&
        sanitized.content.length > CAPTURE_LIMITS.maxTurnContent
      ) {
        sanitized.content =
          sanitized.content.slice(0, CAPTURE_LIMITS.maxTurnContent - 14) +
          "\n[…truncated]";
      }
      if (!sanitized.content) {
        sanitized.content = "[empty]";
      }
      if (
        typeof sanitized.rawHtml === "string" &&
        sanitized.rawHtml.length > CAPTURE_LIMITS.maxRawHtml
      ) {
        sanitized.rawHtml =
          sanitized.rawHtml.slice(0, CAPTURE_LIMITS.maxRawHtml - 14) +
          "\n[…truncated]";
      }
      return sanitized;
    });
  }

  function tagTurnsWithSource(turns, source) {
    return turns.map(function (t) {
      return Object.assign({}, t, { captureSource: source });
    });
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

  function buildRecentRoutingText(turns, title) {
    const snippets = [];
    const normalizedTitle = normalizeText(title);
    if (normalizedTitle) {
      snippets.push(normalizedTitle.slice(0, 160));
    }

    for (
      let index = turns.length - 1;
      index >= 0 && snippets.length < 5;
      index -= 1
    ) {
      const turn = turns[index];
      const content = normalizeText(turn && turn.content);
      if (!content || content.length < 8) {
        continue;
      }

      const role = turn.role === "assistant" ? "assistant" : "user";
      snippets.push(`${role}: ${content.slice(0, 180)}`);
    }

    if (snippets.length === 0) {
      return null;
    }

    return snippets.join("\n").slice(0, 720);
  }

  function buildFullVisibleRoutingText(turns, title) {
    const snippets = [];
    const normalizedTitle = normalizeText(title);
    let totalLength = 0;
    if (normalizedTitle) {
      const titleSnippet = normalizedTitle.slice(0, 200);
      snippets.push(titleSnippet);
      totalLength += titleSnippet.length;
    }

    for (
      let index = 0;
      index < turns.length && totalLength < 5976;
      index += 1
    ) {
      const turn = turns[index];
      const content = normalizeText(turn && turn.content);
      if (!content || content.length < 3) {
        continue;
      }

      const role = turn.role === "assistant" ? "assistant" : "user";
      const remaining = 6000 - totalLength - 1;
      if (remaining <= 24) {
        break;
      }
      const snippet = `${role}: ${content.slice(0, Math.min(220, remaining))}`;
      snippets.push(snippet);
      totalLength += snippet.length + 1;
    }

    if (snippets.length === 0) {
      return null;
    }

    return snippets.join("\n").slice(0, 6000);
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
      routeKind: null,
    };
  }

  function getUrlConversationId(platform, metadata) {
    if (!platform || !metadata || !metadata.url) {
      return null;
    }

    var url = metadata.url;
    var match = null;

    if (platform === "chatgpt") {
      // /g/{id}/c/{id} — chat inside a project → extract chat ID
      match = url.match(/\/g\/[^/]+\/c\/([a-zA-Z0-9-]+)/);
      if (match) return match[1];
      // /g/{id} alone — project directory, not a conversation
      if (/\/g\/[a-zA-Z0-9-]+\/?$/.test(url)) return null;
      // /c/{id} — regular chat
      match = url.match(/\/c\/([a-zA-Z0-9-]+)/);
      if (match) return match[1];
      return null;
    }

    if (platform === "claude" && /\/chat\/([a-zA-Z0-9-]+)/.test(url)) {
      match = url.match(/\/chat\/([a-zA-Z0-9-]+)/);
      return match ? match[1] : null;
    }

    if (platform === "perplexity" && /\/search\/([a-zA-Z0-9-]+)/.test(url)) {
      match = url.match(/\/search\/([a-zA-Z0-9-]+)/);
      return match ? match[1] : null;
    }

    if (platform === "gemini" && /\/app\/([a-zA-Z0-9_-]+)/.test(url)) {
      match = url.match(/\/app\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    }

    if (platform === "grok" && /conversation=([a-zA-Z0-9_-]+)/.test(url)) {
      match = url.match(/conversation=([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    }

    if (platform === "deepseek" && /\/s\/([a-zA-Z0-9_-]+)/.test(url)) {
      match = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    }

    return null;
  }

  function getConversationIdentity(platform, metadata) {
    var fromNetwork =
      networkCaptureCache.latest &&
      networkCaptureCache.latest.platform === platform
        ? networkCaptureCache.latest.conversationId
        : null;

    return (
      fromNetwork ||
      getUrlConversationId(platform, metadata) ||
      metadata.pageFingerprint ||
      null
    );
  }

  const platformPromptSelectors = {
    chatgpt: ["#prompt-textarea", "div[contenteditable='true']", "textarea"],
    codex: [
      "[data-type='unified-composer'] [contenteditable='true']",
      "[data-type='unified-composer'] textarea",
      "#prompt-textarea",
      "div[contenteditable='true']",
      "textarea",
    ],
    claude: ["div[contenteditable='true']", "textarea"],
    perplexity: [
      "textarea[placeholder*='Ask']",
      "textarea",
      "[contenteditable='true']",
    ],
    gemini: [
      ".ql-editor",
      "rich-textarea [contenteditable='true']",
      "[contenteditable='true']",
      "textarea",
    ],
    grok: ["textarea", "[contenteditable='true']"],
    deepseek: ["textarea", "[contenteditable='true']"],
  };

  function findPrompt(config) {
    const runtime = getAdapterRuntime();
    const result = runtime
      ? runtime.findPrompt(document, window.location.href)
      : null;
    if (result) return result;

    const selectors = platformPromptSelectors[config.platform] || [
      "div[contenteditable='true']",
      "textarea",
    ];
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          !node.hasAttribute("disabled")
        ) {
          return {
            element: node,
            isContentEditable:
              node.isContentEditable ||
              node.contentEditable === "true" ||
              node.getAttribute("contenteditable") === "true",
          };
        }
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

  function inferRouteKind(config, metadata) {
    if (metadata.routeKind && metadata.routeKind !== "unknown") {
      return metadata.routeKind;
    }

    const pathname = metadata.pathname || "/";

    if (config.platform === "claude") {
      if (/^\/project\/[^/]+\/?$/.test(pathname)) return "project_root";
      return pathname.includes("/new") ? "fresh" : "chat";
    }

    if (config.platform === "gemini") {
      if (pathname === "/app" || pathname === "/app/") return "fresh";
      if (/^\/prompts\/new/.test(pathname)) return "fresh";
      if (/^\/gems\/[^/]+/.test(pathname)) return "project_root";
      if (/^\/app\/[^/]+/.test(pathname)) return "chat";
      return "fresh";
    }

    if (config.platform === "chatgpt" || config.platform === "codex") {
      // /g/{id}/project/ — project settings page
      if (/^\/g\/[^/]+\/project\/?$/.test(pathname)) return "project_root";
      // /g/{id} — project directory/listing page (no /c/ or /project/ suffix)
      if (/^\/g\/[^/]+\/?$/.test(pathname)) return "project_root";
      return pathname === "/" ? "fresh" : "chat";
    }

    if (config.platform === "grok") {
      return pathname === "/" || pathname === "/i/grok" ? "fresh" : "chat";
    }

    return pathname === "/" ? "fresh" : "chat";
  }

  function computePageState(config) {
    if (!config) {
      return { supported: false };
    }

    const metadata = getPageMetadata();
    const turns = collectTurns(config, metadata);
    const sanitizedTurns = sanitizeTurnsForCapture(turns);
    const promptTarget = findPrompt(config);
    const routeKind = inferRouteKind(config, metadata);
    const isFreshRoute = routeKind === "fresh";
    const promptReady = Boolean(promptTarget);
    const isStarterSurface =
      routeKind === "fresh" || routeKind === "project_root";
    const candidateFresh =
      isStarterSurface && promptReady && turns.length === 0;

    if (!candidateFresh) {
      relayChipState.freshCandidateSince = 0;
    } else if (!relayChipState.freshCandidateSince) {
      relayChipState.freshCandidateSince = Date.now();
    }

    const recentlyStoppedStreaming =
      relayChipState.streamingEndedAt > 0 &&
      Date.now() - relayChipState.streamingEndedAt < PAGE_STABLE_MS;
    const stabilityThreshold = recentlyStoppedStreaming
      ? POST_STREAMING_STABLE_MS
      : PAGE_STABLE_MS;
    const isFreshChat =
      candidateFresh &&
      Date.now() - relayChipState.freshCandidateSince >=
        FRESH_CHAT_STABILIZE_MS;

    const sourceConversationId = getConversationIdentity(config.platform, metadata);
    const isStreaming = hasStreamingActivity(config);
    const captureSignature = computeSignature(
      sanitizedTurns,
      metadata,
      config.platform,
      sourceConversationId,
    );

    // Stability should track meaningful chat progression, not every tiny DOM or
    // text fluctuation inside a message bubble. ChatGPT keeps mutating rendered
    // message markup long after a response is done, which can otherwise keep the
    // page permanently "unstable".
    const contentStabilityKey = JSON.stringify({
      platform: config.platform,
      routeKind,
      pathname: metadata.pathname,
      sourceConversationId,
      turns: turns.length,
      promptReady,
      isFreshRoute,
      isStreaming,
    });

    if (relayChipState.lastContentStabilityKey !== contentStabilityKey) {
      relayChipState.lastContentStabilityKey = contentStabilityKey;
      relayChipState.lastContentChangeAt = Date.now();
    }
    const timeSinceLastContentChange =
      Date.now() - relayChipState.lastContentChangeAt;

    return {
      supported: true,
      platform: config.platform,
      routeKind,
      title: metadata.title,
      url: metadata.url,
      domain: metadata.domain,
      pathname: metadata.pathname,
      pageFingerprint: metadata.pageFingerprint,
      sourceConversationId,
      turns: turns.length,
      captureSignature,
      recentUserTurnText: getLatestMeaningfulUserTurnText(turns),
      recentRoutingText: buildRecentRoutingText(turns, metadata.title),
      fullVisibleRoutingText: buildFullVisibleRoutingText(
        turns,
        metadata.title,
      ),
      promptReady,
      isFreshRoute,
      isFreshChat,
      isStable: timeSinceLastContentChange >= stabilityThreshold,
      isStreaming,
    };
  }

  function buildPageStateKey(pageState) {
    return JSON.stringify({
      supported: pageState.supported,
      routeKind: pageState.routeKind,
      url: pageState.url,
      sourceConversationId: pageState.sourceConversationId,
      turns: pageState.turns,
      captureSignature: pageState.captureSignature,
      recentUserTurnText: pageState.recentUserTurnText,
      recentRoutingText: pageState.recentRoutingText,
      fullVisibleRoutingText: pageState.fullVisibleRoutingText,
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

    if (relayChipState.stabilityRecheckTimer !== null) {
      window.clearTimeout(relayChipState.stabilityRecheckTimer);
      relayChipState.stabilityRecheckTimer = null;
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
        min-width: 240px;
        max-width: min(90%, calc(100vw - 32px));
        border: 1px solid var(--relay-line);
        border-radius: 10px;
        background: var(--relay-bg);
        color: var(--relay-ink);
        box-shadow: var(--relay-shadow);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        overflow: visible;
        z-index: 2147483000;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 140ms ease-out, transform 140ms ease-out;
      }

      .relay-inline-chip[data-theme="light"] {
        --relay-bg: #fafaf9;
        --relay-surface: #ffffff;
        --relay-ink: #0f0f0f;
        --relay-ink-secondary: #3a3a3a;
        --relay-muted: #737373;
        --relay-faint: #a3a3a3;
        --relay-line: rgba(0, 0, 0, 0.06);
        --relay-accent: #171717;
        --relay-accent-text: #fafafa;
        --relay-hover: rgba(0, 0, 0, 0.04);
        --relay-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 4px 12px rgba(0, 0, 0, 0.04);
        --relay-tooltip-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.08);
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
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        border-bottom: none;
      }

      .relay-inline-chip--floating {
        position: fixed;
        right: 16px;
        bottom: 16px;
      }

      .relay-inline-chip__body {
        position: relative;
        display: grid;
        grid-template-columns: 22px 1fr auto;
        grid-template-rows: auto auto;
        gap: 2px 10px;
        padding: 8px 12px;
        align-items: center;
      }

      /* ── Close button: top-right corner ── */
      .relay-inline-chip__close {
        position: absolute;
        top: 6px;
        right: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--relay-faint);
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        z-index: 2;
        transition: background 120ms, color 120ms;
      }

      .relay-inline-chip__close:hover {
        background: var(--relay-hover);
        color: var(--relay-ink);
      }

      /* ── Logo: column 1, spans both rows, vertically centered ── */
      .relay-inline-chip__logo {
        grid-column: 1;
        grid-row: 1 / 3;
        align-self: center;
        justify-self: center;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        object-fit: contain;
      }

      .relay-inline-chip[data-theme="dark"] .relay-inline-chip__logo,
      .relay-inline-chip:not([data-theme]) .relay-inline-chip__logo {
        filter: brightness(1);
      }

      .relay-inline-chip[data-theme="light"] .relay-inline-chip__logo {
        filter: brightness(0);
      }

      /* ── Row 1: project picker (col 2) + insert button (col 3) ── */
      .relay-inline-chip__row1 {
        grid-column: 2;
        grid-row: 1;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }

      .relay-inline-chip__titleWrap {
        position: relative;
        min-width: 0;
        flex: 1;
      }

      .relay-inline-chip__title {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: -0.01em;
      }

      .relay-inline-chip__titleButton {
        width: fit-content;
        max-width: 100%;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: none;
        background: transparent;
        padding: 2px 0;
        color: inherit;
        cursor: pointer;
        font-size: inherit;
        font-family: inherit;
      }

      .relay-inline-chip__titleLabel {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .relay-inline-chip__titleChevron {
        width: 11px;
        height: 11px;
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

      /* ── Insert button: col 3, spans both rows, vertically centered ── */
      .relay-inline-chip__insertWrap {
        grid-column: 3;
        grid-row: 1 / 3;
        align-self: center;
        display: flex;
        align-items: center;
        gap: 6px;
        padding-right: 20px;
      }

      .relay-inline-chip__button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 0;
        height: 26px;
        border: none;
        border-radius: 5px;
        background: var(--relay-accent);
        color: var(--relay-accent-text);
        padding: 0 10px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
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

      .relay-inline-chip__shortcutKey {
        font-size: 10px;
        font-weight: 400;
        opacity: 0.5;
        margin-left: 4px;
      }

      /* ── Row 2: stats (spans col 2-3) ── */
      .relay-inline-chip__row2 {
        grid-column: 2 / 4;
        grid-row: 2;
        font-size: 10px;
        color: var(--relay-faint);
        line-height: 1.4;
      }

      /* ── Issue tooltip ── */
      .relay-inline-chip__infoWrap {
        position: relative;
        display: inline-flex;
        flex: 0 0 auto;
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
        bottom: calc(100% + 6px);
        width: 220px;
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
        transform: translateY(-3px);
        transition: opacity 120ms ease, transform 120ms ease;
        z-index: 10;
      }

      .relay-inline-chip__infoWrap:hover .relay-inline-chip__tooltip,
      .relay-inline-chip__infoWrap:focus-within .relay-inline-chip__tooltip {
        opacity: 1;
        transform: translateY(0);
      }

      .relay-inline-chip__projectMenu,
      .relay-association-toast__projectMenu {
        display: grid;
        gap: 2px;
        padding: 6px;
        border: 1px solid var(--relay-line);
        border-radius: 8px;
        background: var(--relay-surface);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      }

      .relay-inline-chip__projectMenu {
        position: absolute;
        bottom: calc(100% + 6px);
        left: 0;
        min-width: 180px;
        z-index: 20;
      }

      .relay-association-toast__projectMenu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: 4px;
        z-index: 10;
      }

      .relay-inline-chip__projectOption,
      .relay-association-toast__projectOption {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--relay-ink-secondary);
        padding: 7px 10px;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
        transition: background 100ms ease;
      }

      .relay-inline-chip__projectOption:hover,
      .relay-association-toast__projectOption:hover {
        background: var(--relay-hover);
      }

      .relay-inline-chip__projectOption--active,
      .relay-association-toast__projectOption--active {
        color: var(--relay-ink);
        font-weight: 600;
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
        right: 0;
        display: grid;
        gap: 10px;
        min-width: 220px;
        max-width: min(340px, calc(100vw - 16px));
        padding: 12px 14px 12px 14px;
        border: 1px solid var(--relay-line);
        border-top-left-radius: 14px;
        border-top-right-radius: 0;
        border-bottom-left-radius: 14px;
        border-bottom-right-radius: 0;
        border-right: none;
        background: var(--relay-bg);
        color: var(--relay-ink);
        box-shadow: var(--relay-shadow);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        z-index: 2147483001;
        overflow: visible;
        opacity: 0;
        transform: translateX(100%);
        transition: opacity 200ms ease, transform 200ms ease;
      }

      .relay-association-toast[data-theme="light"] {
        --relay-bg: rgba(250, 250, 249, 0.97);
        --relay-surface: #ffffff;
        --relay-ink: #0f0f0f;
        --relay-ink-secondary: #3a3a3a;
        --relay-muted: #737373;
        --relay-faint: #a3a3a3;
        --relay-line: rgba(0, 0, 0, 0.06);
        --relay-accent: #171717;
        --relay-accent-text: #fafafa;
        --relay-hover: rgba(0, 0, 0, 0.04);
        --relay-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), 0 12px 32px rgba(0, 0, 0, 0.08);
      }

      .relay-association-toast--visible {
        opacity: 1;
        transform: translateX(0);
      }

      .relay-association-toast--hiding {
        opacity: 0;
        transform: translateX(100%);
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

      .relay-toast-text-shimmer {
        background: linear-gradient(90deg, var(--relay-muted) 0%, var(--relay-muted) 30%, var(--relay-ink) 50%, var(--relay-muted) 70%, var(--relay-muted) 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: relay-shimmer 2s ease-in-out infinite;
      }

      .relay-association-toast__titleWrap {
        position: relative;
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

      .relay-association-toast__timer--static {
        cursor: default;
      }

      .relay-association-toast__timer--static:hover {
        background: transparent;
        color: var(--relay-muted);
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

  // Per-platform composer-container tokens. Each token can be:
  //  • a plain HTML tag name           ("form", "fieldset", "textarea")
  //  • a custom element tag name       ("query-bar", "prompt-box-container")
  //  • a bare class name               ("aaff8b8f" → ".aaff8b8f")
  //  • a Tailwind group-name class     ("group/composer" → ".group\/composer")
  //  • any raw CSS selector            ("[class*='composer']", "#chat")
  // normalizeContainerToken() converts each into a valid CSS selector so
  // the whole list can be passed to element.closest() in one call.
  const containerSelectorTokens = {
    chatgpt: ["form"],
    codex: ["[data-type='unified-composer']", "group/composer", "form"],
    claude: ["fieldset", "form", "[class*='composer']", "[class*='Composer']"],
    gemini: [
      // closest() walks up from .ql-editor and returns the NEAREST ancestor
      // matching any token. `rich-textarea` and the `text-input-field_*`
      // wrappers at depth 1-4 are all the same size as the prompt itself
      // and must NOT match — otherwise the chip ignores attachments.
      // Use exact class selectors (leading dot) so the `text-input-field_*`
      // substring classes don't trip us up.
      "input-area-v2",
      ".input-area",
      ".text-input-field",
      "form",
    ],
    aistudio: [
      "ms-prompt-box",
      "prompt-box-container",
      "[class*='input-wrapper']",
      "form",
    ],
    perplexity: [
      "[class*='ComposerContainer']",
      "[class*='query-input']",
      "form",
    ],
    grok: ["query-bar", "form", "[class*='composer']"],
    deepseek: ["aaff8b8f", "form", "[class*='chat-input']"],
  };

  const HTML_TAG_NAMES = new Set([
    "form",
    "fieldset",
    "div",
    "section",
    "header",
    "footer",
    "main",
    "nav",
    "aside",
    "article",
    "textarea",
    "input",
    "label",
    "button",
  ]);

  function normalizeContainerToken(token) {
    if (!token || typeof token !== "string") return "";
    const trimmed = token.trim();
    if (!trimmed) return "";

    // Raw CSS selectors — anything with selector punctuation passes through.
    if (/[\[\]#\.\>\s\*\:\,]/.test(trimmed)) return trimmed;

    // Tailwind group-name syntax like "group/composer" → class selector.
    if (trimmed.includes("/")) {
      return "." + trimmed.replace(/\//g, "\\/");
    }

    // Hyphenated name → custom element tag (e.g. <prompt-box-container>).
    // Non-hyphenated known HTML tags also pass through as element selectors.
    if (trimmed.includes("-")) return trimmed;
    if (HTML_TAG_NAMES.has(trimmed.toLowerCase())) return trimmed;

    // Bare identifier falls back to a class selector.
    return "." + trimmed;
  }

  const containerSelectorsBuilt = {};
  for (const key of Object.keys(containerSelectorTokens)) {
    containerSelectorsBuilt[key] = containerSelectorTokens[key]
      .map(normalizeContainerToken)
      .filter(Boolean)
      .join(", ");
  }

  function resolveChipPlatformKey(platform) {
    // aistudio.google.com and gemini.google.com both map to platform="gemini"
    // at the adapter level, but they have completely different composer DOM.
    // Split them here so chip offsets and container selectors can differ.
    if (
      platform === "gemini" &&
      typeof window !== "undefined" &&
      window.location &&
      window.location.hostname === "aistudio.google.com"
    ) {
      return "aistudio";
    }
    return platform;
  }

  function findComposerContainer(element, platform) {
    // Walk up from the prompt element to find the full composer container
    // (includes attachments, toolbars, etc.) for accurate vertical positioning.
    const key = resolveChipPlatformKey(platform);
    const selector = containerSelectorsBuilt[key];
    if (selector) {
      try {
        const container = element.closest(selector);
        if (container) return container;
      } catch {
        // Bad selector shouldn't crash positioning — fall through.
      }
    }

    // Fallback: walk up from the prompt until we find an ancestor noticeably
    // taller than the prompt itself — that's almost always the composer
    // wrapper containing attachments / toolbars. Stops before we reach a
    // full-page layout wrapper.
    try {
      const promptRect = element.getBoundingClientRect();
      let node = element.parentElement;
      let best = element;
      let depth = 0;
      while (node && depth < 10) {
        const rect = node.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.95) break;
        if (
          rect.height > promptRect.height + 24 &&
          rect.top <= promptRect.top
        ) {
          best = node;
        }
        node = node.parentElement;
        depth += 1;
      }
      return best;
    } catch {
      return element;
    }
  }

  const DEFAULT_CHIP_OFFSETS = {
    chatgpt: 0,
    codex: 0,
    claude: 0,
    perplexity: 0,
    gemini: 0,
    aistudio: 0,
    grok: 0,
    deepseek: 0,
  };
  let userChipOffsets = {};
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["relay.chipOffsets"], (stored) => {
        if (stored && stored["relay.chipOffsets"]) {
          userChipOffsets = stored["relay.chipOffsets"];
        }
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes["relay.chipOffsets"]) {
          userChipOffsets = changes["relay.chipOffsets"].newValue || {};
        }
      });
    }
  } catch {}

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
    const container = findComposerContainer(promptTarget.element, config.platform);
    const containerRect = container.getBoundingClientRect();
    const dynamicWidth = clamp(
      rect.width,
      280,
      Math.min(600, window.innerWidth - 32),
    );
    root.style.width = `${Math.round(dynamicWidth)}px`;
    const chipHeight = root.offsetHeight || 200;
    const left = clamp(
      rect.left + (rect.width - dynamicWidth) / 2,
      16,
      Math.max(16, window.innerWidth - dynamicWidth - 16),
    );

    const chipKey = resolveChipPlatformKey(config.platform);
    const vOffset =
      (userChipOffsets && userChipOffsets[chipKey]) ??
      DEFAULT_CHIP_OFFSETS[chipKey] ??
      -4;
    let top = containerRect.top - chipHeight + vOffset;
    if (top < 16) {
      top = containerRect.bottom + Math.abs(vOffset);
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
    if (!activeState.page.supported) return false;
    if (!activeState.showCue && !relayChipState.forcedVisible) return false;
    if (relayChipState.dismissed && !relayChipState.forcedVisible) return false;

    if (relayChipState.forcedVisible) return true;

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
        message:
          '<span class="relay-inline-chip__shimmer">Inserting project brief…</span>',
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
        message:
          '<span class="relay-inline-chip__shimmer">Inserting project brief…</span>',
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
      toastState.expiresAt == null
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
      digestStatus: toastState.digestStatus || null,
      reason: toastState.reason || null,
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

  function formatProjectSwitcherOptions(
    projectOptions,
    activeProjectId,
    className,
  ) {
    return projectOptions
      .map((project) => {
        const active = project.id === activeProjectId;
        return `
          <button
            class="${className}${active ? ` ${className}--active` : ""}"
            type="button"
            data-project-id="${escapeHtml(project.id)}"
          >
            ${active ? '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 8.5 6.5 12 13 4"></polyline></svg>' : '<span style="width:12px"></span>'}
            <span>${escapeHtml(project.name)}</span>
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
        projectId: activeState.projectId,
      },
    });
    if (!result || !result.ok) {
      // Verify post-hoc: if prompt now contains non-trivial text, insertion
      // likely succeeded despite a race-y ok:false. Only log error if prompt
      // is still empty (true failure).
      const promptTarget = findPrompt(getSiteConfig());
      const promptText = promptTarget ? readPromptText(promptTarget) : "";
      const likelyInserted = promptText && promptText.trim().length > 40;
      if (!likelyInserted) {
        emitInlineTelemetry({
          level: "warn",
          area: "insert",
          event: "inline_insert.failed",
          flowId,
          message:
            result && result.reason
              ? result.reason
              : "Insert failed from inline chip.",
          context: {
            projectId: activeState.projectId,
          },
        });
      }
      relayChipState.buttonMode = "idle";
      relayChipState.buttonError = "";
      relayChipState.dismissed = true;
      relayChipState.forcedInsertKind = null;
      hideInlineChipWithMotion();
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
    }, 1200);

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
    relayChipState.forcedVisible = false;
    relayChipState.forcedInsertKind = null;
    hideInlineChipWithMotion();
  }

  function renderInlineChip() {
    const config = getSiteConfig();
    const activeState = getRenderableState();

    if (!config || !activeState || !shouldRenderChip(activeState)) {
      // Don't remove chip during transitional sync states — prevents flicker
      // when force-syncing on tab focus triggers loading → ready broadcasts
      const isTransitional =
        activeState &&
        (activeState.remoteStatus === "loading" ||
          activeState.remoteStatus === "stale");
      if (!isTransitional || !document.getElementById("relay-inline-chip")) {
        removeInlineChipImmediately();
      }
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

      // Note: All user-controlled values are sanitized via escapeHtml() before insertion.
      // chipTitle is built from escapeHtml'd values above. buttonClassName uses only hardcoded class names.
      const shortcutDisplay = escapeHtml(
        activeState.shortcutLabel || "\u2318\u21e7I",
      );
      const trustStats =
        activeState.trust &&
        (activeState.trust.recentChatCount > 0 ||
          activeState.trust.savedContextCount > 0)
          ? `${escapeHtml(String(activeState.trust.recentChatCount))} chats \u00b7 ${escapeHtml(String(activeState.trust.savedContextCount))} saved`
          : escapeHtml(activeState.trustLine || "");
      const freshnessText = activeState.freshnessText
        ? ` \u00b7 ${escapeHtml(activeState.freshnessText)}`
        : "";
      const logoUrl =
        typeof chrome !== "undefined" && chrome.runtime
          ? chrome.runtime.getURL("assets/relay_logo_white.png")
          : "";

      root.innerHTML = `
        <div class="relay-inline-chip__body">
          <button class="relay-inline-chip__close" type="button" aria-label="Dismiss">\u00d7</button>
          <img class="relay-inline-chip__logo" src="${escapeHtml(logoUrl)}" alt="Relay" />
          <div class="relay-inline-chip__row1">
            ${chipTitle}
          </div>
          <div class="relay-inline-chip__insertWrap">
            ${
              shouldShowIssue
                ? `<div class="relay-inline-chip__infoWrap">
                    <button class="relay-inline-chip__info" type="button" aria-label="Details">i</button>
                    <div class="relay-inline-chip__tooltip">${escapeHtml(activeState.issue.detail)}</div>
                  </div>`
                : ""
            }
            <button class="${buttonClassName}" type="button" ${activeState.canInsert && insertUiState.mode !== "loading" ? "" : "disabled"}>
              ${getButtonLabel(activeState)}<span class="relay-inline-chip__shortcutKey">${shortcutDisplay}</span>
            </button>
          </div>
          <div class="relay-inline-chip__row2">
            ${trustStats}${freshnessText}
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

      root
        .querySelectorAll(".relay-inline-chip__projectOption")
        .forEach((button) => {
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
    if (payload.expiresAt <= 0) {
      return "";
    }

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
      <button class="relay-association-toast__timer" type="button" aria-label="Pause auto-save timer">
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
    if (
      getAssociationToastKey(previousPayload) !==
      getAssociationToastKey(payload)
    ) {
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
      payload.mode === "saving"
        ? `Saving to ${payload.projectName}`
        : payload.mode === "done"
          ? payload.digestStatus === "analyzed"
            ? "Saved & analyzed"
            : payload.digestStatus === "queued"
              ? "Saved - analysis queued"
              : `Saved to ${payload.projectName}`
          : `Approve save to ${payload.projectName}`;
    const meta =
      payload.mode === "saving"
        ? payload.reason || `Saving this chat to ${payload.projectName}...`
        : payload.mode === "done"
          ? payload.digestStatus === "analyzed"
            ? "Chat captured and your project brief is being updated."
            : payload.digestStatus === "queued"
              ? "Chat captured. Analysis will run shortly."
              : "Chat captured to your project."
          : payload.reason || "Relay is not fully sure. Approve now or review it later in the sidebar.";
    const showActions = payload.mode === "ask";
    const showDismiss = payload.mode !== "done";
    const canSwitchProject =
      payload.mode === "ask" &&
      payload.projectOptions &&
      payload.projectOptions.length > 1;
    const toastProjectSwitcherOpen = isProjectSwitcherOpen("toast");
    const titleMarkup =
      canSwitchProject
        ? `
          <div class="relay-association-toast__titleWrap">
            <button
              class="relay-association-toast__titleButton"
              type="button"
              aria-label="Switch association project"
              aria-expanded="${toastProjectSwitcherOpen ? "true" : "false"}"
            >
              <span class="relay-association-toast__title relay-association-toast__titleLabel ${payload.mode === 'saving' ? 'relay-toast-text-shimmer' : ''}">${escapeHtml(title)}</span>
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
        : `<p class="relay-association-toast__title ${payload.mode === 'saving' ? 'relay-toast-text-shimmer' : ''}">${escapeHtml(title)}</p>`;

    root.classList.toggle(
      "relay-association-toast--clickable",
      false,
    );
    root.innerHTML = `
      <div class="relay-association-toast__header">
        ${titleMarkup}
        ${
          showDismiss
            ? '<button class="relay-association-toast__dismiss" type="button" aria-label="Dismiss association toast">×</button>'
            : ""
        }
      </div>
      <p class="relay-association-toast__meta">${escapeHtml(meta)}</p>
      ${
        showActions
          ? `<div class="relay-association-toast__actions">
        <button class="relay-association-toast__button relay-association-toast__button--primary" type="button" data-action="approve">Approve save</button><button class="relay-association-toast__button relay-association-toast__button--subtle" type="button" data-action="cancel">Not this chat</button>
        ${renderAssociationToastTimer(payload)}
      </div>`
          : ""
      }
    `;

    root.onclick = null;

    const titleButton = root.querySelector(
      ".relay-association-toast__titleButton",
    );
    if (titleButton) {
      titleButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleProjectSwitcher("toast");
      });
    }

    root
      .querySelectorAll(".relay-association-toast__projectOption")
      .forEach((button) => {
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
            projectOptions:
              response.state?.projectOptions ?? payload.projectOptions,
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

        if (action !== "approve") {
          hideAssociationToast();
        }
      });
    });

    const dismissButton = root.querySelector(
      ".relay-association-toast__dismiss",
    );
    if (dismissButton) {
      dismissButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (root.dataset.pendingAction) {
          return;
        }

        if (payload.mode === "saving") {
          hideAssociationToast();
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

    const timerButton =
      payload.mode === "auto_save"
        ? root.querySelector(".relay-association-toast__timer")
        : null;
    if (timerButton) {
      timerButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!relayChipState.associationToast.paused) {
          void setAssociationToastPaused(root, payload, true);
        }
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
      relayChipState.associationToast.countdownTimer = window.setInterval(
        () => {
          updateAssociationToastCountdown(root, payload);
        },
        250,
      );
    }
  }

  async function pushObservedPageState(force) {
    const nextHref = window.location.href;
    if (relayChipState.href !== nextHref) {
      relayChipState.href = nextHref;
      relayChipState.dismissed = false;
      relayChipState.forcedVisible = false;
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

    let pageState;
    try {
      const siteConfig = getSiteConfig();
      console.debug("[Relay] getSiteConfig() →", siteConfig);
      pageState = computePageState(siteConfig);
    } catch (err) {
      console.debug("[Relay] computePageState threw:", err);
      emitInlineTelemetry({
        level: "error",
        area: "runtime",
        event: "inline_chip.compute_page_state_error",
        message: "computePageState threw during observation.",
        error: { message: String((err && err.message) || err) },
      });
      pageState = { supported: false };
    }
    console.debug("[Relay] pageState →", {
      supported: pageState.supported,
      platform: pageState.platform,
      routeKind: pageState.routeKind,
    });
    relayChipState.pageState = pageState;

    // Fast path: when streaming just ended, record the time and schedule a quick
    // stability recheck so captures fire ~800ms after streaming stops
    const nowStreaming = pageState.supported && pageState.isStreaming;
    if (relayChipState.wasStreaming && !nowStreaming) {
      relayChipState.streamingEndedAt = Date.now();
      if (relayChipState.stabilityRecheckTimer !== null) {
        window.clearTimeout(relayChipState.stabilityRecheckTimer);
      }
      relayChipState.stabilityRecheckTimer = window.setTimeout(() => {
        relayChipState.stabilityRecheckTimer = null;
        queuePageObservation(false);
      }, POST_STREAMING_STABLE_MS);
    }
    if (nowStreaming) {
      relayChipState.streamingEndedAt = 0;
    }
    relayChipState.wasStreaming = !!nowStreaming;

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

    // Schedule a re-check after PAGE_STABLE_MS so isStable can transition to true.
    // Without this, after mutations stop, nothing triggers a re-observation and
    // the background never sees isStable=true (required for auto-capture).
    if (relayChipState.stabilityRecheckTimer !== null) {
      window.clearTimeout(relayChipState.stabilityRecheckTimer);
    }
    relayChipState.stabilityRecheckTimer = window.setTimeout(() => {
      relayChipState.stabilityRecheckTimer = null;
      queuePageObservation(false);
    }, PAGE_STABLE_MS + 100);
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
    ["pushState", "replaceState"].forEach(function (methodName) {
      var original = window.history[methodName];
      if (typeof original !== "function") {
        return;
      }

      window.history[methodName] = function () {
        var result = original.apply(this, arguments);
        relayChipState.lastMeaningfulMutationAt = Date.now();
        queuePageObservation(true);
        return result;
      };
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
      let pageState;
      try {
        pageState =
          relayChipState.pageState ?? computePageState(getSiteConfig());
      } catch (err) {
        pageState = { supported: false };
      }
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
          message:
            "Shortcut triggered project brief insertion from a visible chip.",
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
        relayChipState.forcedVisible = true;
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
      relayChipState.forcedVisible = true;
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

      const metadata = getPageMetadata();
      const rawTurns = collectTurns(config, metadata);
      const turns = sanitizeTurnsForCapture(rawTurns);
      const sourceConversationId = getConversationIdentity(
        config.platform,
        metadata,
      );

      sendResponse({
        ok: true,
        capture: {
          platform: config.platform,
          session: {
            title: metadata.title,
            url: metadata.url,
            pageFingerprint: metadata.pageFingerprint,
            sourceConversationId,
            captureSignature: computeSignature(turns, metadata, config.platform, sourceConversationId),
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
      error: event.error
        ? {
            message: String(event.error.message || event.error),
            stack: event.error.stack || null,
          }
        : { message: event.message || "Unhandled content-script error." },
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

  // ─── MAIN world → ISOLATED world bridge ──────────────────────────────
  // Receives network-intercepted conversation data from the MAIN world
  // content script (network-intercept.ts) and stores it in the cache so
  // the next collectTurns() call can merge network + DOM turns.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "RELAY_NETWORK_CAPTURE") return;

    const payload = event.data.payload;
    if (
      !payload ||
      typeof payload.platform !== "string" ||
      !Array.isArray(payload.turns)
    ) {
      return;
    }

    networkCaptureCache.latest = {
      platform: payload.platform,
      conversationId: payload.conversationId ?? null,
      title: payload.title ?? null,
      url: payload.url ?? "",
      turns: payload.turns,
      capturedAt: payload.capturedAt ?? Date.now(),
    };

    if (window.__RELAY_DEBUG) {
      console.log(
        "[Relay] Network capture received:",
        payload.platform,
        payload.turns.length,
        "turns",
      );
    }
  });

  void initializeRelayTheme();
  scheduleObservation();
})();
