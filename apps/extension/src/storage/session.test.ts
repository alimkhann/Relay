import { describe, expect, it } from "vitest"

import { normalizeRelaySession } from "./session"

describe("normalizeRelaySession", () => {
  it("clears stale override keys when legacy storage had no explicit target mode", () => {
    const session = normalizeRelaySession({
      "relay.targetProfileKey": "claude_code_build"
    })

    expect(session.targetMode).toBe("auto")
    expect(session.targetProfileKey).toBe("")
  })

  it("keeps the manual override when target mode is explicitly stored", () => {
    const session = normalizeRelaySession({
      "relay.targetMode": "manual",
      "relay.targetProfileKey": "claude_code_build"
    })

    expect(session.targetMode).toBe("manual")
    expect(session.targetProfileKey).toBe("claude_code_build")
  })
})
