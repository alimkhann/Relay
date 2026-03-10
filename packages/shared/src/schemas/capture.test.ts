import { describe, expect, it } from "vitest"

import { capturePayloadSchema } from "./capture"

describe("capturePayloadSchema", () => {
  it("accepts a supported capture payload", () => {
    const result = capturePayloadSchema.safeParse({
      projectId: "project-1",
      platform: "chatgpt",
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
})
