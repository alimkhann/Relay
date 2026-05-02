/**
 * MAIN world fetch interception — network-intercept.js
 *
 * Injected into the MAIN world via chrome.scripting.registerContentScripts
 * at document_start. Wraps window.fetch before the AI site's app bundle
 * loads so we can intercept full conversation API responses.
 *
 * Architecture:
 *   MAIN world (this file)
 *     → Wraps window.fetch
 *     → Filters by platform URL patterns (ChatGPT, Claude, Perplexity, Codex, Gemini, Grok, DeepSeek)
 *     → Parses response JSON
 *     → Posts structured data to ISOLATED world via window.postMessage
 *
 *   ISOLATED world (relay-content.js)
 *     → Receives RELAY_NETWORK_CAPTURE messages
 *     → Caches network turns
 *     → Merges with DOM-scraped turns on next capture
 *
 * No chrome.* APIs are available in MAIN world. No imports allowed.
 */
(function relayNetworkIntercept() {
  "use strict";

  // Guard against double-injection
  if (window.__relayNetworkInterceptActive) return;
  window.__relayNetworkInterceptActive = true;

  // ─── URL Matchers ────────────────────────────────────────────────────

  var CHATGPT_CONVERSATION_RE =
    /\/backend-api\/conversation\/([0-9a-f-]{36})(?:\?|$)/;
  var CLAUDE_CONVERSATION_RE =
    /\/api\/organizations\/[^/]+\/chat_conversations\/([0-9a-f-]{36})(?:\?|$)/;
  var PERPLEXITY_THREAD_RE =
    /\/api\/(?:v1\/)?(?:query|thread)\/([a-f0-9-]+)(?:\?|$)/i;

  // Gemini: conversation/history endpoints + AI Studio generateContent
  var GEMINI_CONVERSATION_RE =
    /\/(?:api\/)?(?:conversations?|threads?|history|chats?)\/([a-zA-Z0-9_-]+)(?:\?|$)/;
  var GEMINI_GENERATE_RE =
    /\/v1(?:beta)?\/models\/[^/]+\/generateContent/;

  // Grok: conversation API endpoints
  var GROK_CONVERSATION_RE =
    /\/(?:rest\/app-chat\/)?conversations?\/([a-zA-Z0-9_-]+)(?:\?|$)/;
  var GROK_API_RE =
    /\/(?:api|rest)\/(?:app-chat|grok)\/(?:conversations?|history|messages)/;

  // DeepSeek: chat history endpoints
  var DEEPSEEK_CHAT_HISTORY_RE =
    /\/api\/v\d+\/chat(?:\/history)?\/([a-zA-Z0-9_-]+)(?:\?|$)/;
  var DEEPSEEK_CHAT_API_RE =
    /\/api\/(?:v\d+\/)?(?:chat|conversation)(?:\/history|\/messages)?(?:\?|$)/;

  /**
   * Determine platform from hostname for cases where URL path patterns
   * overlap (e.g. Codex and ChatGPT both use /backend-api/conversation/).
   */
  var hostname = window.location.hostname;

  function isCodexHost() {
    return hostname === "codex.openai.com" ||
      (hostname === "chatgpt.com" && /\/codex/.test(window.location.pathname));
  }

  function isGeminiHost() {
    return hostname === "gemini.google.com" || hostname === "aistudio.google.com";
  }

  function isGrokHost() {
    return hostname === "grok.com";
  }

  function isDeepSeekHost() {
    return hostname === "chat.deepseek.com";
  }

  function matchUrl(url) {
    var m;

    // ── ChatGPT / Codex (share same API path, disambiguate by host) ──
    m = CHATGPT_CONVERSATION_RE.exec(url);
    if (m) {
      var platform = isCodexHost() ? "codex" : "chatgpt";
      return { platform: platform, conversationId: m[1] || null };
    }

    // ── Claude ──
    m = CLAUDE_CONVERSATION_RE.exec(url);
    if (m) return { platform: "claude", conversationId: m[1] || null };

    // ── Perplexity ──
    m = PERPLEXITY_THREAD_RE.exec(url);
    if (m) return { platform: "perplexity", conversationId: m[1] || null };

    // ── Gemini ──
    if (isGeminiHost()) {
      m = GEMINI_CONVERSATION_RE.exec(url);
      if (m) return { platform: "gemini", conversationId: m[1] || null };
      if (GEMINI_GENERATE_RE.test(url)) return { platform: "gemini", conversationId: null };
    }

    // ── Grok ──
    if (isGrokHost()) {
      m = GROK_CONVERSATION_RE.exec(url);
      if (m) return { platform: "grok", conversationId: m[1] || null };
      if (GROK_API_RE.test(url)) return { platform: "grok", conversationId: null };
    }

    // ── DeepSeek ──
    if (isDeepSeekHost()) {
      m = DEEPSEEK_CHAT_HISTORY_RE.exec(url);
      if (m) return { platform: "deepseek", conversationId: m[1] || null };
      if (DEEPSEEK_CHAT_API_RE.test(url)) return { platform: "deepseek", conversationId: null };
    }

    return null;
  }

  // ─── ChatGPT Parser ─────────────────────────────────────────────────

  function extractTextFromParts(parts) {
    return parts
      .filter(function (p) { return typeof p === "string"; })
      .join("\n")
      .trim();
  }

  function normalizeChatGPTRole(role) {
    if (role === "user") return "user";
    if (role === "assistant") return "assistant";
    return "system";
  }

  function walkMainBranch(mapping) {
    // Find root node (no parent or parent not in mapping)
    var rootId = null;
    var ids = Object.keys(mapping);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var node = mapping[id];
      if (!node.parent || !(node.parent in mapping)) {
        rootId = id;
        break;
      }
    }
    if (!rootId) return [];

    var ordered = [];
    var currentId = rootId;
    var visited = {};

    while (currentId && !visited[currentId]) {
      visited[currentId] = true;
      var current = mapping[currentId];
      if (!current) break;
      ordered.push(current);
      var kids = current.children || [];
      currentId = kids.length > 0 ? kids[kids.length - 1] : null;
    }

    return ordered;
  }

  function parseChatGPTConversation(data) {
    if (!data || typeof data !== "object") return null;
    if (!data.mapping || typeof data.mapping !== "object") return null;

    var nodes = walkMainBranch(data.mapping);
    var turns = [];
    var turnIndex = 0;

    for (var i = 0; i < nodes.length; i++) {
      var msg = nodes[i].message;
      if (!msg) continue;

      var role = normalizeChatGPTRole(msg.author && msg.author.role);
      if (role === "system") continue;

      var parts = msg.content && msg.content.parts;
      if (!parts || !Array.isArray(parts)) continue;

      var content = extractTextFromParts(parts);
      if (!content) continue;

      turns.push({ role: role, content: content, turnIndex: turnIndex });
      turnIndex++;
    }

    return { title: data.title || null, turns: turns };
  }

  // ─── Claude Parser ──────────────────────────────────────────────────

  function normalizeClaudeRole(sender) {
    return sender === "human" ? "user" : "assistant";
  }

  function extractClaudeText(msg) {
    if (msg.content && Array.isArray(msg.content)) {
      var texts = [];
      for (var i = 0; i < msg.content.length; i++) {
        var b = msg.content[i];
        if (b.type === "text" && typeof b.text === "string") {
          texts.push(b.text);
        }
      }
      if (texts.length > 0) return texts.join("\n").trim();
    }
    if (typeof msg.text === "string") return msg.text.trim();
    return "";
  }

  function parseClaudeConversation(data) {
    if (!data || typeof data !== "object") return null;
    if (!data.chat_messages || !Array.isArray(data.chat_messages)) return null;

    var turns = [];
    for (var i = 0; i < data.chat_messages.length; i++) {
      var msg = data.chat_messages[i];
      var content = extractClaudeText(msg);
      if (!content) continue;

      turns.push({
        role: normalizeClaudeRole(msg.sender),
        content: content,
        turnIndex: i,
      });
    }

    return { title: data.name || null, turns: turns };
  }

  // ─── Perplexity Parser ──────────────────────────────────────────────

  function getPerplexityQuery(entry) {
    return (entry.query_str || entry.query || "").trim();
  }

  function getPerplexityAnswer(entry) {
    return (entry.text || entry.answer || "").trim();
  }

  function parsePerplexityThread(data) {
    if (!data || typeof data !== "object") return null;

    var entries = data.thread || data.entries;

    // Case 1: Array of entries
    if (entries && Array.isArray(entries) && entries.length > 0) {
      var turns = [];
      var turnIndex = 0;

      for (var i = 0; i < entries.length; i++) {
        var query = getPerplexityQuery(entries[i]);
        if (query) {
          turns.push({ role: "user", content: query, turnIndex: turnIndex });
          turnIndex++;
        }
        var answer = getPerplexityAnswer(entries[i]);
        if (answer) {
          turns.push({ role: "assistant", content: answer, turnIndex: turnIndex });
          turnIndex++;
        }
      }

      var title = turns.length > 0 ? getPerplexityQuery(entries[0]) || null : null;
      return { title: title, turns: turns };
    }

    // Case 2: Single query/answer
    if (typeof data.query_str === "string" && typeof data.text === "string") {
      var singleTurns = [];
      if (data.query_str.trim()) {
        singleTurns.push({ role: "user", content: data.query_str.trim(), turnIndex: 0 });
      }
      if (data.text.trim()) {
        singleTurns.push({ role: "assistant", content: data.text.trim(), turnIndex: 1 });
      }
      if (singleTurns.length > 0) {
        return { title: data.query_str.trim() || null, turns: singleTurns };
      }
    }

    return null;
  }

  // ─── Codex Parser ────────────────────────────────────────────────────
  // Codex uses the same response format as ChatGPT (OpenAI backend).
  // We reuse parseChatGPTConversation and just tag as "codex".
  var parseCodexConversation = parseChatGPTConversation;

  // ─── Gemini Parser ──────────────────────────────────────────────────

  function normalizeGeminiRole(role) {
    if (role === "user" || role === "human") return "user";
    return "assistant"; // "model", "assistant", "gemini", etc.
  }

  function extractGeminiMessageText(msg) {
    if (typeof msg.text === "string") return msg.text.trim();
    if (typeof msg.content === "string") return msg.content.trim();
    if (Array.isArray(msg.content)) {
      var texts = [];
      for (var i = 0; i < msg.content.length; i++) {
        if (typeof msg.content[i].text === "string") texts.push(msg.content[i].text);
      }
      if (texts.length > 0) return texts.join("\n").trim();
    }
    if (Array.isArray(msg.parts)) {
      var partTexts = [];
      for (var j = 0; j < msg.parts.length; j++) {
        if (typeof msg.parts[j].text === "string") partTexts.push(msg.parts[j].text);
      }
      if (partTexts.length > 0) return partTexts.join("\n").trim();
    }
    return "";
  }

  function parseGeminiConversation(data) {
    if (!data || typeof data !== "object") return null;

    // Shape 1: History/conversation format with messages array
    var messages = data.messages || data.conversation || data.turns;
    if (messages && Array.isArray(messages) && messages.length > 0) {
      var turns = [];
      var turnIndex = 0;
      for (var i = 0; i < messages.length; i++) {
        var content = extractGeminiMessageText(messages[i]);
        if (!content) continue;
        var role = normalizeGeminiRole(messages[i].role || messages[i].author);
        turns.push({ role: role, content: content, turnIndex: turnIndex });
        turnIndex++;
      }
      if (turns.length > 0) {
        return { title: data.title || data.name || null, turns: turns };
      }
    }

    // Shape 2: generateContent response with candidates
    if (data.candidates && Array.isArray(data.candidates)) {
      var genTurns = [];
      var genIdx = 0;
      // Include input contents if present
      if (data.contents && Array.isArray(data.contents)) {
        for (var ci = 0; ci < data.contents.length; ci++) {
          var cParts = data.contents[ci].parts;
          if (!cParts || !Array.isArray(cParts)) continue;
          var cTexts = [];
          for (var cp = 0; cp < cParts.length; cp++) {
            if (typeof cParts[cp].text === "string") cTexts.push(cParts[cp].text);
          }
          var cText = cTexts.join("\n").trim();
          if (!cText) continue;
          genTurns.push({ role: normalizeGeminiRole(data.contents[ci].role), content: cText, turnIndex: genIdx });
          genIdx++;
        }
      }
      // Add candidate responses
      for (var di = 0; di < data.candidates.length; di++) {
        var candContent = data.candidates[di].content;
        if (!candContent || !candContent.parts || !Array.isArray(candContent.parts)) continue;
        var candTexts = [];
        for (var dp = 0; dp < candContent.parts.length; dp++) {
          if (typeof candContent.parts[dp].text === "string") candTexts.push(candContent.parts[dp].text);
        }
        var candText = candTexts.join("\n").trim();
        if (!candText) continue;
        genTurns.push({ role: normalizeGeminiRole(candContent.role), content: candText, turnIndex: genIdx });
        genIdx++;
      }
      if (genTurns.length > 0) {
        return { title: null, turns: genTurns };
      }
    }

    return null;
  }

  // ─── Grok Parser ────────────────────────────────────────────────────

  function normalizeGrokRole(role) {
    if (role === "user" || role === "human") return "user";
    return "assistant";
  }

  function extractGrokText(msg) {
    if (typeof msg.content === "string") return msg.content.trim();
    if (typeof msg.text === "string") return msg.text.trim();
    if (typeof msg.message === "string") return msg.message.trim();
    return "";
  }

  function parseGrokMessages(messages, title) {
    var turns = [];
    var turnIndex = 0;
    for (var i = 0; i < messages.length; i++) {
      var content = extractGrokText(messages[i]);
      if (!content) continue;
      turns.push({
        role: normalizeGrokRole(messages[i].role || messages[i].sender),
        content: content,
        turnIndex: turnIndex,
      });
      turnIndex++;
    }
    if (turns.length === 0) return null;
    return { title: title, turns: turns };
  }

  function parseGrokConversation(data) {
    if (!data || typeof data !== "object") return null;

    // Direct messages array
    if (data.messages && Array.isArray(data.messages)) {
      return parseGrokMessages(data.messages, data.title || data.name || null);
    }
    // Wrapped in result
    if (data.result && data.result.messages && Array.isArray(data.result.messages)) {
      return parseGrokMessages(data.result.messages, data.result.title || data.title || null);
    }
    // Wrapped in data
    if (data.data) {
      if (data.data.messages && Array.isArray(data.data.messages)) {
        return parseGrokMessages(data.data.messages, data.data.title || data.title || null);
      }
      if (data.data.conversation && data.data.conversation.messages && Array.isArray(data.data.conversation.messages)) {
        return parseGrokMessages(data.data.conversation.messages, data.data.conversation.title || data.title || null);
      }
    }
    return null;
  }

  // ─── DeepSeek Parser ────────────────────────────────────────────────

  function normalizeDeepSeekRole(role) {
    if (role === "user") return "user";
    return "assistant";
  }

  function extractDeepSeekContent(msg) {
    var raw = "";
    if (typeof msg.content === "string") raw = msg.content;
    else if (typeof msg.message === "string") raw = msg.message;
    else if (typeof msg.text === "string") raw = msg.text;
    // Strip <think>...</think> blocks from reasoning models
    return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }

  function parseDeepSeekMessages(messages, title) {
    var turns = [];
    var turnIndex = 0;
    for (var i = 0; i < messages.length; i++) {
      var content = extractDeepSeekContent(messages[i]);
      if (!content) continue;
      turns.push({
        role: normalizeDeepSeekRole(messages[i].role),
        content: content,
        turnIndex: turnIndex,
      });
      turnIndex++;
    }
    if (turns.length === 0) return null;
    return { title: title, turns: turns };
  }

  function parseDeepSeekConversation(data) {
    if (!data || typeof data !== "object") return null;

    // Direct messages array
    var directMsgs = data.messages || data.chat_messages;
    if (directMsgs && Array.isArray(directMsgs)) {
      return parseDeepSeekMessages(directMsgs, data.title || null);
    }
    // Wrapped in data
    if (data.data) {
      var dataMsgs = data.data.messages || data.data.chat_messages;
      if (dataMsgs && Array.isArray(dataMsgs)) {
        return parseDeepSeekMessages(dataMsgs, data.data.title || data.title || null);
      }
      // Wrapped in data.biz_data
      if (data.data.biz_data && data.data.biz_data.chat_messages && Array.isArray(data.data.biz_data.chat_messages)) {
        return parseDeepSeekMessages(data.data.biz_data.chat_messages, data.data.biz_data.title || data.title || null);
      }
    }
    return null;
  }

  // ─── Dispatcher ─────────────────────────────────────────────────────

  function parseResponse(match, data) {
    switch (match.platform) {
      case "chatgpt":
        return parseChatGPTConversation(data);
      case "codex":
        return parseCodexConversation(data);
      case "claude":
        return parseClaudeConversation(data);
      case "perplexity":
        return parsePerplexityThread(data);
      case "gemini":
        return parseGeminiConversation(data);
      case "grok":
        return parseGrokConversation(data);
      case "deepseek":
        return parseDeepSeekConversation(data);
      default:
        return null;
    }
  }

  function postToIsolatedWorld(match, parsed) {
    if (parsed.turns.length === 0) return;

    window.postMessage({
      type: "RELAY_NETWORK_CAPTURE",
      payload: {
        platform: match.platform,
        conversationId: match.conversationId,
        title: parsed.title,
        url: window.location.href,
        turns: parsed.turns,
        capturedAt: Date.now(),
      },
    }, "*");
  }

  // ─── Process Response ───────────────────────────────────────────────

  function processResponse(response, match) {
    try {
      var cloned = response.clone();
      cloned.text().then(function (text) {
        if (!text || text.length < 10) return;

        var data;
        try {
          data = JSON.parse(text);
        } catch (_e) {
          return; // Not JSON
        }

        var parsed = parseResponse(match, data);
        if (!parsed || parsed.turns.length === 0) return;

        postToIsolatedWorld(match, parsed);
      }).catch(function () {
        // Silently fail
      });
    } catch (_e) {
      // Silently fail — never break the page
    }
  }

  // ─── Wrap window.fetch ──────────────────────────────────────────────

  var _originalFetch = window.fetch;

  window.fetch = function relayInterceptedFetch(input, init) {
    return _originalFetch.call(window, input, init).then(function (response) {
      try {
        var url;
        if (typeof input === "string") {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input instanceof Request) {
          url = input.url;
        } else {
          return response;
        }

        var method = (init && init.method ? init.method : "GET").toUpperCase();
        if (method !== "GET") return response;

        if (!response.ok) return response;

        var match = matchUrl(url);
        if (match) {
          processResponse(response, match);
        }
      } catch (_e) {
        // Never break the page
      }

      return response;
    });
  };

  if (typeof console !== "undefined") {
    console.debug("[Relay] Network intercept active on", window.location.hostname);
  }
})();
