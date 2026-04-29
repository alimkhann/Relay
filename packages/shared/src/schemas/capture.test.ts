import { describe, expect, it } from "vitest"

import { capturePayloadSchema } from "./capture"

describe("capturePayloadSchema", () => {
  it("accepts a supported capture payload", () => {
    const result = capturePayloadSchema.safeParse({
      projectId: "project-1",
      platform: "chatgpt",
      processingMode: "fast_ack",
      session: {
        title: "Relay",
        url: "https://chatgpt.com/c/123"
      },
      turns: [
        {
          role: "user",
          content: "Build Relay",
          turnIndex: 0
        }
      ]
    })

    expect(result.success).toBe(true)
  })

  it("accepts Relay inserted-context metadata", () => {
    const result = capturePayloadSchema.safeParse({
      projectId: "project-1",
      platform: "chatgpt",
      session: {
        title: "Relay",
        url: "https://chatgpt.com/c/123",
        metadata: {
          relayInsertedContext: {
            kind: "fresh_chat_bootstrap",
            packetId: "packet-1",
            insertedContentHash: "hash-1",
            deltaKind: "edited",
            rawTurnCount: 4,
            filteredTurnCount: 2,
            assistantOutcome: "kept_novel"
          }
        }
      },
      turns: [
        {
          role: "user",
          content: "User additions after Relay inserted project brief: narrow the scope to extension capture.",
          turnIndex: 0
        }
      ]
    })

    expect(result.success).toBe(true)
  })
})
