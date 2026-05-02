import { describe, it, expect } from "vitest"
import { matchChatGPT, parseChatGPTConversation } from "./chatgpt"
import { matchClaude, parseClaudeConversation } from "./claude"
import { matchPerplexity, parsePerplexityThread } from "./perplexity"
import { matchCodex, parseCodexConversation } from "./codex"
import { matchGemini, parseGeminiConversation } from "./gemini"
import { matchGrok, parseGrokConversation } from "./grok"
import { matchDeepSeek, parseDeepSeekConversation } from "./deepseek"

// ─── ChatGPT ────────────────────────────────────────────────────────

describe("matchChatGPT", () => {
  it("matches a conversation URL", () => {
    const result = matchChatGPT(
      "https://chatgpt.com/backend-api/conversation/550e8400-e29b-41d4-a716-446655440000",
    )
    expect(result).toEqual({
      platform: "chatgpt",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
    })
  })

  it("matches with query params", () => {
    const result = matchChatGPT(
      "https://chatgpt.com/backend-api/conversation/550e8400-e29b-41d4-a716-446655440000?source=web",
    )
    expect(result).not.toBeNull()
    expect(result!.conversationId).toBe("550e8400-e29b-41d4-a716-446655440000")
  })

  it("returns null for non-matching URL", () => {
    expect(matchChatGPT("https://chatgpt.com/backend-api/models")).toBeNull()
  })
})

describe("parseChatGPTConversation", () => {
  it("parses a conversation mapping into ordered turns", () => {
    const data = {
      title: "Test Chat",
      mapping: {
        root: {
          message: null,
          parent: null,
          children: ["user1"],
        },
        user1: {
          message: {
            author: { role: "user" },
            content: { content_type: "text", parts: ["Hello"] },
          },
          parent: "root",
          children: ["assistant1"],
        },
        assistant1: {
          message: {
            author: { role: "assistant" },
            content: { content_type: "text", parts: ["Hi there!"] },
          },
          parent: "user1",
          children: [],
        },
      },
    }

    const result = parseChatGPTConversation(data)
    expect(result).not.toBeNull()
    expect(result!.title).toBe("Test Chat")
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[0]).toEqual({ role: "user", content: "Hello", turnIndex: 0 })
    expect(result!.turns[1]).toEqual({ role: "assistant", content: "Hi there!", turnIndex: 1 })
  })

  it("skips system messages", () => {
    const data = {
      title: "Test",
      mapping: {
        root: {
          message: {
            author: { role: "system" },
            content: { content_type: "text", parts: ["System prompt"] },
          },
          parent: null,
          children: ["user1"],
        },
        user1: {
          message: {
            author: { role: "user" },
            content: { content_type: "text", parts: ["Hi"] },
          },
          parent: "root",
          children: [],
        },
      },
    }

    const result = parseChatGPTConversation(data)
    expect(result!.turns).toHaveLength(1)
    expect(result!.turns[0]!.role).toBe("user")
  })

  it("returns null for invalid data", () => {
    expect(parseChatGPTConversation(null)).toBeNull()
    expect(parseChatGPTConversation({})).toBeNull()
    expect(parseChatGPTConversation({ mapping: "not-an-object" })).toBeNull()
  })

  it("follows the main branch (last child)", () => {
    const data = {
      title: "Branched",
      mapping: {
        root: {
          message: null,
          parent: null,
          children: ["user1"],
        },
        user1: {
          message: {
            author: { role: "user" },
            content: { content_type: "text", parts: ["Q1"] },
          },
          parent: "root",
          children: ["branch_a", "branch_b"],
        },
        branch_a: {
          message: {
            author: { role: "assistant" },
            content: { content_type: "text", parts: ["Old answer"] },
          },
          parent: "user1",
          children: [],
        },
        branch_b: {
          message: {
            author: { role: "assistant" },
            content: { content_type: "text", parts: ["Active answer"] },
          },
          parent: "user1",
          children: [],
        },
      },
    }

    const result = parseChatGPTConversation(data)
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[1]!.content).toBe("Active answer")
  })
})

// ─── Claude ─────────────────────────────────────────────────────────

describe("matchClaude", () => {
  it("matches a conversation URL", () => {
    const result = matchClaude(
      "https://claude.ai/api/organizations/org-abc/chat_conversations/550e8400-e29b-41d4-a716-446655440000",
    )
    expect(result).toEqual({
      platform: "claude",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
    })
  })

  it("returns null for non-matching URL", () => {
    expect(matchClaude("https://claude.ai/api/organizations/org-abc/settings")).toBeNull()
  })
})

describe("parseClaudeConversation", () => {
  it("parses chat_messages into turns", () => {
    const data = {
      name: "Claude Chat",
      chat_messages: [
        {
          sender: "human",
          content: [{ type: "text", text: "What is Relay?" }],
          index: 0,
        },
        {
          sender: "assistant",
          content: [{ type: "text", text: "Relay is a memory sidecar." }],
          index: 1,
        },
      ],
    }

    const result = parseClaudeConversation(data)
    expect(result).not.toBeNull()
    expect(result!.title).toBe("Claude Chat")
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[0]).toEqual({ role: "user", content: "What is Relay?", turnIndex: 0 })
    expect(result!.turns[1]).toEqual({ role: "assistant", content: "Relay is a memory sidecar.", turnIndex: 1 })
  })

  it("falls back to top-level text field", () => {
    const data = {
      name: "Fallback",
      chat_messages: [
        { sender: "human", text: "Plain text message" },
      ],
    }

    const result = parseClaudeConversation(data)
    expect(result!.turns).toHaveLength(1)
    expect(result!.turns[0]!.content).toBe("Plain text message")
  })

  it("skips messages with empty content", () => {
    const data = {
      chat_messages: [
        { sender: "human", content: [] },
        { sender: "assistant", text: "   " },
        { sender: "human", text: "Real message" },
      ],
    }

    const result = parseClaudeConversation(data)
    expect(result!.turns).toHaveLength(1)
    expect(result!.turns[0]!.content).toBe("Real message")
  })

  it("returns null for invalid data", () => {
    expect(parseClaudeConversation(null)).toBeNull()
    expect(parseClaudeConversation({})).toBeNull()
    expect(parseClaudeConversation({ chat_messages: "not-array" })).toBeNull()
  })
})

// ─── Perplexity ─────────────────────────────────────────────────────

describe("matchPerplexity", () => {
  it("matches a thread URL", () => {
    const result = matchPerplexity("https://www.perplexity.ai/api/v1/thread/abc-123")
    expect(result).toEqual({
      platform: "perplexity",
      conversationId: "abc-123",
    })
  })

  it("matches a query URL", () => {
    const result = matchPerplexity("https://www.perplexity.ai/api/query/def-456")
    expect(result).not.toBeNull()
    expect(result!.conversationId).toBe("def-456")
  })

  it("returns null for non-matching URL", () => {
    expect(matchPerplexity("https://www.perplexity.ai/api/user/settings")).toBeNull()
  })
})

describe("parsePerplexityThread", () => {
  it("parses thread entries array", () => {
    const data = {
      thread: [
        { query_str: "What is TypeScript?", text: "TypeScript is a typed superset of JS." },
        { query_str: "How to use it?", text: "Install via npm." },
      ],
    }

    const result = parsePerplexityThread(data)
    expect(result).not.toBeNull()
    expect(result!.title).toBe("What is TypeScript?")
    expect(result!.turns).toHaveLength(4)
    expect(result!.turns[0]).toEqual({ role: "user", content: "What is TypeScript?", turnIndex: 0 })
    expect(result!.turns[1]).toEqual({ role: "assistant", content: "TypeScript is a typed superset of JS.", turnIndex: 1 })
    expect(result!.turns[2]).toEqual({ role: "user", content: "How to use it?", turnIndex: 2 })
    expect(result!.turns[3]).toEqual({ role: "assistant", content: "Install via npm.", turnIndex: 3 })
  })

  it("parses entries array (alternative format)", () => {
    const data = {
      entries: [
        { query: "What is Neon?", answer: "A serverless Postgres service." },
      ],
    }

    const result = parsePerplexityThread(data)
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[0]!.content).toBe("What is Neon?")
    expect(result!.turns[1]!.content).toBe("A serverless Postgres service.")
  })

  it("parses single query/answer response", () => {
    const data = {
      query_str: "Hello",
      text: "Hi there!",
    }

    const result = parsePerplexityThread(data)
    expect(result!.turns).toHaveLength(2)
    expect(result!.title).toBe("Hello")
  })

  it("returns null for invalid data", () => {
    expect(parsePerplexityThread(null)).toBeNull()
    expect(parsePerplexityThread({})).toBeNull()
    expect(parsePerplexityThread({ thread: [] })).toBeNull()
  })
})

// ─── Codex ──────────────────────────────────────────────────────────

describe("matchCodex", () => {
  it("matches a conversation URL", () => {
    const result = matchCodex(
      "https://codex.openai.com/backend-api/conversation/550e8400-e29b-41d4-a716-446655440000",
    )
    expect(result).toEqual({
      platform: "codex",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
    })
  })

  it("matches with query params", () => {
    const result = matchCodex(
      "https://codex.openai.com/backend-api/conversation/550e8400-e29b-41d4-a716-446655440000?source=web",
    )
    expect(result).not.toBeNull()
    expect(result!.conversationId).toBe("550e8400-e29b-41d4-a716-446655440000")
  })

  it("returns null for non-matching URL", () => {
    expect(matchCodex("https://codex.openai.com/backend-api/models")).toBeNull()
  })
})

describe("parseCodexConversation", () => {
  it("parses a conversation mapping (same format as ChatGPT)", () => {
    const data = {
      title: "Codex Task",
      mapping: {
        root: {
          message: null,
          parent: null,
          children: ["user1"],
        },
        user1: {
          message: {
            author: { role: "user" },
            content: { content_type: "text", parts: ["Fix the bug"] },
          },
          parent: "root",
          children: ["assistant1"],
        },
        assistant1: {
          message: {
            author: { role: "assistant" },
            content: { content_type: "text", parts: ["I'll fix that bug now."] },
          },
          parent: "user1",
          children: [],
        },
      },
    }

    const result = parseCodexConversation(data)
    expect(result).not.toBeNull()
    expect(result!.title).toBe("Codex Task")
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[0]).toEqual({ role: "user", content: "Fix the bug", turnIndex: 0 })
    expect(result!.turns[1]).toEqual({ role: "assistant", content: "I'll fix that bug now.", turnIndex: 1 })
  })

  it("returns null for invalid data", () => {
    expect(parseCodexConversation(null)).toBeNull()
    expect(parseCodexConversation({})).toBeNull()
  })
})

// ─── Gemini ─────────────────────────────────────────────────────────

describe("matchGemini", () => {
  it("matches a conversation URL", () => {
    const result = matchGemini(
      "https://gemini.google.com/api/conversations/abc-123",
    )
    expect(result).toEqual({
      platform: "gemini",
      conversationId: "abc-123",
    })
  })

  it("matches a history URL", () => {
    const result = matchGemini(
      "https://gemini.google.com/api/history/xyz-789",
    )
    expect(result).not.toBeNull()
    expect(result!.conversationId).toBe("xyz-789")
  })

  it("matches generateContent URL", () => {
    const result = matchGemini(
      "https://aistudio.google.com/v1beta/models/gemini-pro/generateContent",
    )
    expect(result).toEqual({
      platform: "gemini",
      conversationId: null,
    })
  })

  it("returns null for non-matching URL", () => {
    expect(matchGemini("https://gemini.google.com/app")).toBeNull()
  })
})

describe("parseGeminiConversation", () => {
  it("parses messages array (history format)", () => {
    const data = {
      title: "Gemini Chat",
      messages: [
        { role: "user", text: "Explain quantum computing" },
        { role: "model", text: "Quantum computing uses qubits..." },
      ],
    }

    const result = parseGeminiConversation(data)
    expect(result).not.toBeNull()
    expect(result!.title).toBe("Gemini Chat")
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[0]).toEqual({ role: "user", content: "Explain quantum computing", turnIndex: 0 })
    expect(result!.turns[1]).toEqual({ role: "assistant", content: "Quantum computing uses qubits...", turnIndex: 1 })
  })

  it("parses conversation array format", () => {
    const data = {
      name: "My Conversation",
      conversation: [
        { role: "user", content: "Hello" },
        { role: "model", content: "Hi there!" },
      ],
    }

    const result = parseGeminiConversation(data)
    expect(result!.title).toBe("My Conversation")
    expect(result!.turns).toHaveLength(2)
  })

  it("parses content as array of parts", () => {
    const data = {
      messages: [
        { role: "user", content: [{ text: "Part 1" }, { text: "Part 2" }] },
      ],
    }

    const result = parseGeminiConversation(data)
    expect(result!.turns).toHaveLength(1)
    expect(result!.turns[0]!.content).toBe("Part 1\nPart 2")
  })

  it("parses generateContent response (candidates format)", () => {
    const data = {
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: "Here is the answer." }],
          },
        },
      ],
    }

    const result = parseGeminiConversation(data)
    expect(result).not.toBeNull()
    expect(result!.turns).toHaveLength(1)
    expect(result!.turns[0]).toEqual({ role: "assistant", content: "Here is the answer.", turnIndex: 0 })
  })

  it("includes input contents from generateContent request", () => {
    const data = {
      contents: [
        { role: "user", parts: [{ text: "What is 2+2?" }] },
      ],
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: "4" }],
          },
        },
      ],
    }

    const result = parseGeminiConversation(data)
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[0]!.role).toBe("user")
    expect(result!.turns[1]!.role).toBe("assistant")
  })

  it("returns null for invalid data", () => {
    expect(parseGeminiConversation(null)).toBeNull()
    expect(parseGeminiConversation({})).toBeNull()
    expect(parseGeminiConversation({ messages: [] })).toBeNull()
  })
})

// ─── Grok ───────────────────────────────────────────────────────────

describe("matchGrok", () => {
  it("matches a conversation URL", () => {
    const result = matchGrok(
      "https://grok.com/rest/app-chat/conversations/conv-abc123",
    )
    expect(result).toEqual({
      platform: "grok",
      conversationId: "conv-abc123",
    })
  })

  it("matches a simpler conversation path", () => {
    const result = matchGrok("https://grok.com/conversations/xyz")
    expect(result).not.toBeNull()
    expect(result!.conversationId).toBe("xyz")
  })

  it("matches the API endpoint", () => {
    const result = matchGrok("https://grok.com/api/grok/history")
    expect(result).toEqual({
      platform: "grok",
      conversationId: null,
    })
  })

  it("returns null for non-matching URL", () => {
    expect(matchGrok("https://grok.com/settings")).toBeNull()
  })
})

describe("parseGrokConversation", () => {
  it("parses direct messages array", () => {
    const data = {
      title: "Grok Chat",
      messages: [
        { role: "user", content: "Tell me a joke" },
        { role: "assistant", content: "Why did the chicken..." },
      ],
    }

    const result = parseGrokConversation(data)
    expect(result).not.toBeNull()
    expect(result!.title).toBe("Grok Chat")
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[0]).toEqual({ role: "user", content: "Tell me a joke", turnIndex: 0 })
    expect(result!.turns[1]).toEqual({ role: "assistant", content: "Why did the chicken...", turnIndex: 1 })
  })

  it("parses messages wrapped in result", () => {
    const data = {
      result: {
        title: "Nested Chat",
        messages: [
          { role: "user", text: "Hello" },
          { role: "assistant", text: "Hi!" },
        ],
      },
    }

    const result = parseGrokConversation(data)
    expect(result!.title).toBe("Nested Chat")
    expect(result!.turns).toHaveLength(2)
  })

  it("parses messages wrapped in data", () => {
    const data = {
      data: {
        title: "Data Chat",
        messages: [
          { role: "user", content: "Test" },
        ],
      },
    }

    const result = parseGrokConversation(data)
    expect(result!.title).toBe("Data Chat")
    expect(result!.turns).toHaveLength(1)
  })

  it("parses messages wrapped in data.conversation", () => {
    const data = {
      data: {
        conversation: {
          title: "Deep Chat",
          messages: [
            { sender: "human", message: "Deep test" },
          ],
        },
      },
    }

    const result = parseGrokConversation(data)
    expect(result!.title).toBe("Deep Chat")
    expect(result!.turns).toHaveLength(1)
    expect(result!.turns[0]!.role).toBe("user")
  })

  it("returns null for invalid data", () => {
    expect(parseGrokConversation(null)).toBeNull()
    expect(parseGrokConversation({})).toBeNull()
    expect(parseGrokConversation({ messages: [] })).toBeNull()
  })
})

// ─── DeepSeek ───────────────────────────────────────────────────────

describe("matchDeepSeek", () => {
  it("matches a chat history URL", () => {
    const result = matchDeepSeek(
      "https://chat.deepseek.com/api/v0/chat/history/abc-123",
    )
    expect(result).toEqual({
      platform: "deepseek",
      conversationId: "abc-123",
    })
  })

  it("matches a chat URL without history", () => {
    const result = matchDeepSeek(
      "https://chat.deepseek.com/api/v0/chat/conv-456",
    )
    expect(result).not.toBeNull()
    expect(result!.conversationId).toBe("conv-456")
  })

  it("matches generic chat API", () => {
    const result = matchDeepSeek(
      "https://chat.deepseek.com/api/chat/history",
    )
    expect(result).toEqual({
      platform: "deepseek",
      conversationId: null,
    })
  })

  it("returns null for non-matching URL", () => {
    expect(matchDeepSeek("https://chat.deepseek.com/settings")).toBeNull()
  })
})

describe("parseDeepSeekConversation", () => {
  it("parses direct messages array", () => {
    const data = {
      title: "DeepSeek Chat",
      messages: [
        { role: "user", content: "Explain monads" },
        { role: "assistant", content: "A monad is a design pattern..." },
      ],
    }

    const result = parseDeepSeekConversation(data)
    expect(result).not.toBeNull()
    expect(result!.title).toBe("DeepSeek Chat")
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[0]).toEqual({ role: "user", content: "Explain monads", turnIndex: 0 })
    expect(result!.turns[1]).toEqual({ role: "assistant", content: "A monad is a design pattern...", turnIndex: 1 })
  })

  it("parses chat_messages array", () => {
    const data = {
      title: "Alt Format",
      chat_messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
      ],
    }

    const result = parseDeepSeekConversation(data)
    expect(result!.turns).toHaveLength(2)
  })

  it("parses data-wrapped response", () => {
    const data = {
      data: {
        title: "Wrapped",
        messages: [
          { role: "user", content: "Test" },
        ],
      },
    }

    const result = parseDeepSeekConversation(data)
    expect(result!.title).toBe("Wrapped")
    expect(result!.turns).toHaveLength(1)
  })

  it("parses biz_data-wrapped response", () => {
    const data = {
      data: {
        biz_data: {
          title: "Biz Data",
          chat_messages: [
            { role: "user", content: "Biz test" },
          ],
        },
      },
    }

    const result = parseDeepSeekConversation(data)
    expect(result!.title).toBe("Biz Data")
    expect(result!.turns).toHaveLength(1)
  })

  it("strips <think> blocks from reasoning models", () => {
    const data = {
      messages: [
        { role: "user", content: "What is 2+2?" },
        {
          role: "assistant",
          content: "<think>Let me calculate... 2+2=4</think>The answer is 4.",
        },
      ],
    }

    const result = parseDeepSeekConversation(data)
    expect(result!.turns).toHaveLength(2)
    expect(result!.turns[1]!.content).toBe("The answer is 4.")
  })

  it("handles empty content after stripping think blocks", () => {
    const data = {
      messages: [
        { role: "assistant", content: "<think>Internal reasoning only</think>" },
      ],
    }

    const result = parseDeepSeekConversation(data)
    // After stripping think blocks, content is empty, so no turns
    expect(result).toBeNull()
  })

  it("returns null for invalid data", () => {
    expect(parseDeepSeekConversation(null)).toBeNull()
    expect(parseDeepSeekConversation({})).toBeNull()
  })
})
