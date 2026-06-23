import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DORMANT_AFTER_MS,
  DORMANT_AUTO_WAKE_DAILY_LIMIT,
  applyDormantAutoWakeAttempt,
  applyMeaningfulActivity,
  canAttemptDormantAutoWake,
  createEmptyDormancyState,
  isDormant,
  shouldSkipRemoteSyncForDormancy,
  trustedDormancySourceFromMessage,
} from "./dormancy"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("extension dormancy policy", () => {
  it("treats missing activity as dormant for upgraded signed-in installs", () => {
    expect(isDormant(Date.UTC(2026, 5, 23), createEmptyDormancyState())).toBe(true)
  })

  it("stays active under the 48h threshold and becomes dormant at the threshold", () => {
    const now = Date.UTC(2026, 5, 23, 12)
    const state = {
      ...createEmptyDormancyState(),
      lastMeaningfulActivityAt: now - DORMANT_AFTER_MS + 1,
    }

    expect(isDormant(now, state)).toBe(false)
    expect(
      isDormant(now, {
        ...state,
        lastMeaningfulActivityAt: now - DORMANT_AFTER_MS,
      }),
    ).toBe(true)
  })

  it("meaningful activity exits dormancy and clears enteredDormantAt", () => {
    const now = Date.UTC(2026, 5, 23, 12)
    const state = {
      ...createEmptyDormancyState(),
      enteredDormantAt: now - 1_000,
    }

    const next = applyMeaningfulActivity(state, "sidepanel_opened", now)

    expect(next.lastMeaningfulActivityAt).toBe(now)
    expect(next.lastMeaningfulActivityKind).toBe("sidepanel_opened")
    expect(next.enteredDormantAt).toBeNull()
    expect(isDormant(now, next)).toBe(false)
  })

  it("dedupes dormant auto-wake attempts by signature and caps them per day", () => {
    const now = Date.UTC(2026, 5, 23, 12)
    let state = createEmptyDormancyState()

    expect(canAttemptDormantAutoWake(state, "sig-1", now)).toBe(true)
    state = applyDormantAutoWakeAttempt(state, "sig-1", now)

    expect(canAttemptDormantAutoWake(state, "sig-1", now)).toBe(false)
    expect(canAttemptDormantAutoWake(state, "sig-2", now)).toBe(true)
    state = applyDormantAutoWakeAttempt(state, "sig-2", now)

    expect(state.autoWakeAttempts.count).toBe(DORMANT_AUTO_WAKE_DAILY_LIMIT)
    expect(canAttemptDormantAutoWake(state, "sig-3", now)).toBe(false)
    expect(canAttemptDormantAutoWake(state, "sig-3", now + 24 * 60 * 60 * 1_000)).toBe(true)
  })

  it("normalizes invalid persisted activity kind values", async () => {
    vi.resetModules()
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            "relay.dormancy.lastMeaningfulActivityAt": Date.UTC(2026, 5, 23),
            "relay.dormancy.lastMeaningfulActivityKind": "not_real",
          }),
        },
      },
    })
    const { readDormancyState } = await import("./dormancy")

    await expect(readDormancyState()).resolves.toMatchObject({
      lastMeaningfulActivityKind: null,
    })
  })

  it("does not fail meaningful activity when storage writes reject", async () => {
    vi.resetModules()
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockRejectedValue(new Error("quota")),
        },
      },
    })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { markMeaningfulActivity } = await import("./dormancy")

    await expect(
      markMeaningfulActivity("sidepanel_opened", Date.UTC(2026, 5, 23)),
    ).resolves.toMatchObject({
      lastMeaningfulActivityKind: "sidepanel_opened",
    })

    warn.mockRestore()
  })
})

describe("dormant remote sync gate", () => {
  it("blocks passive tab and content-script sync while dormant", () => {
    expect(
      shouldSkipRemoteSyncForDormancy({
        dormant: true,
        reason: "tab_focus",
      }),
    ).toBe(true)

    expect(
      shouldSkipRemoteSyncForDormancy({
        dormant: true,
        reason: "active_state_request",
        source: "content_script",
      }),
    ).toBe(true)

    expect(
      shouldSkipRemoteSyncForDormancy({
        dormant: true,
        reason: "project_dashboard_request",
        source: "content_script",
      }),
    ).toBe(true)

    expect(
      shouldSkipRemoteSyncForDormancy({
        dormant: true,
        reason: "capture_needs_project",
      }),
    ).toBe(true)
  })

  it("allows explicit extension UI sources to wake sync", () => {
    expect(
      shouldSkipRemoteSyncForDormancy({
        dormant: true,
        reason: "active_state_request",
        source: "sidepanel",
      }),
    ).toBe(false)

    expect(
      shouldSkipRemoteSyncForDormancy({
        dormant: true,
        reason: "active_state_request",
        source: "extension_chat",
      }),
    ).toBe(false)

    expect(
      shouldSkipRemoteSyncForDormancy({
        dormant: true,
        reason: "active_state_request",
        source: "inline_chip",
      }),
    ).toBe(false)

    expect(
      shouldSkipRemoteSyncForDormancy({
        dormant: true,
        reason: "active_state_request",
        source: "shortcut",
      }),
    ).toBe(false)
  })
})

describe("trusted dormancy message sources", () => {
  it("downgrades passive content-script messages and blocks spoofed UI sources", () => {
    const sender = { tab: { id: 123 } }

    expect(trustedDormancySourceFromMessage("content_script", sender)).toBe("content_script")
    expect(trustedDormancySourceFromMessage("sidepanel", sender)).toBe("content_script")
    expect(trustedDormancySourceFromMessage("extension_chat", sender)).toBe("content_script")
  })

  it("preserves content-script user gestures that are meaningful activity", () => {
    const sender = { tab: { id: 123 } }

    expect(trustedDormancySourceFromMessage("inline_chip", sender)).toBe("inline_chip")
    expect(trustedDormancySourceFromMessage("shortcut", sender)).toBe("shortcut")
  })

  it("trusts extension UI senders only for extension UI sources", () => {
    const sender = {}

    expect(trustedDormancySourceFromMessage("sidepanel", sender)).toBe("sidepanel")
    expect(trustedDormancySourceFromMessage("extension_chat", sender)).toBe("extension_chat")
    expect(trustedDormancySourceFromMessage("inline_chip", sender)).toBeUndefined()
    expect(trustedDormancySourceFromMessage("shortcut", sender)).toBeUndefined()
  })

  it("trusts extension pages even when Chrome includes a tab on the sender", () => {
    const sender = {
      tab: { id: 123 },
      url: "chrome-extension://relay-test/sidepanel.html",
    }

    expect(trustedDormancySourceFromMessage("sidepanel", sender)).toBe("sidepanel")
    expect(trustedDormancySourceFromMessage("extension_chat", sender)).toBe("extension_chat")
  })
})
