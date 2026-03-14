import { describe, expect, it } from "vitest"

import { normalizeRelaySession, resolveRelayApiBase } from "./session"

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

describe("resolveRelayApiBase", () => {
  it("prefers the configured local api base when local auth is enabled", () => {
    expect(
      resolveRelayApiBase({
        storedApiBase: "https://relay-flow.vercel.app",
        authProvider: "local",
        configuredApiBase: "http://localhost:3000"
      })
    ).toBe("http://localhost:3000")
  })

  it("keeps the stored api base in neon mode", () => {
    expect(
      resolveRelayApiBase({
        storedApiBase: "https://relay-flow.vercel.app",
        authProvider: "neon",
        configuredApiBase: "http://localhost:3000"
      })
    ).toBe("https://relay-flow.vercel.app")
  })
})
