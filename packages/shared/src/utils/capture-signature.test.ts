import { describe, expect, it } from "vitest"

import { buildCaptureSignature, withCaptureSignature } from "./capture-signature"

describe("capture signature helpers", () => {
  it("stays stable when a conversation keeps the same content but DOM turn indexes shift", () => {
    const base = buildCaptureSignature({
      platform: "claude",
      url: "https://claude.ai/chat/first-url-variant",
      pageFingerprint: "chat-123",
      sourceConversationId: "chat-123",
      turns: [
        { role: "user", turnIndex: 2, content: "Plan the Relay fix." },
        { role: "assistant", turnIndex: 5, content: "Here is the plan." },
      ],
    })

    const shifted = buildCaptureSignature({
      platform: "claude",
      url: "https://claude.ai/chat/second-url-variant?foo=bar",
      pageFingerprint: "chat-123",
      sourceConversationId: "chat-123",
      turns: [
        { role: "user", turnIndex: 0, content: "Plan the Relay fix." },
        { role: "assistant", turnIndex: 1, content: "Here is the plan." },
      ],
    })

    expect(shifted).toBe(base)
  })

  it("changes when the captured conversation content actually changes", () => {
    const before = buildCaptureSignature({
      platform: "chatgpt",
      url: "https://chatgpt.com/c/abc",
      sourceConversationId: "abc",
      turns: [{ role: "user", turnIndex: 0, content: "Draft a launch plan." }],
    })

    const after = buildCaptureSignature({
      platform: "chatgpt",
      url: "https://chatgpt.com/c/abc",
      sourceConversationId: "abc",
      turns: [
        { role: "user", turnIndex: 0, content: "Draft a launch plan." },
        { role: "assistant", turnIndex: 1, content: "Here is a launch plan." },
      ],
    })

    expect(after).not.toBe(before)
  })

  it("fills in a stable capture signature from the canonical conversation identity", () => {
    const payload = withCaptureSignature({
      projectId: "project_123",
      platform: "perplexity",
      session: {
        title: "Routing bug",
        url: "https://perplexity.ai/search/relay-routing?utm=abc",
        pageFingerprint: "relay-routing",
        sourceConversationId: "relay-routing",
      },
      turns: [{ role: "user", turnIndex: 0, content: "Why did this recapture?" }],
    })

    expect(payload.session.captureSignature).toBe(
      buildCaptureSignature({
        platform: "perplexity",
        url: "https://perplexity.ai/search/relay-routing?utm=abc",
        pageFingerprint: "relay-routing",
        sourceConversationId: "relay-routing",
        turns: [{ role: "user", turnIndex: 0, content: "Why did this recapture?" }],
      }),
    )
  })
})
