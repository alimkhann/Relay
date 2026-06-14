import { describe, it, expect } from "vitest"

import { decideDueLifecycleEmail, type LifecycleUserSignals } from "./lifecycle-email-service"

const NOW = Date.UTC(2026, 5, 14)
const DAY = 86_400_000

function user(overrides: Partial<LifecycleUserSignals>): LifecycleUserSignals {
  return {
    userId: "u1",
    email: "a@b.com",
    name: "Sam",
    createdAtMs: NOW - 2 * DAY,
    lastCaptureAtMs: NOW - 1 * DAY,
    hasCaptured: true,
    hasBriefViewed: false,
    hasMcp: false,
    ...overrides,
  }
}

describe("decideDueLifecycleEmail", () => {
  it("returns null when there is no email address", () => {
    expect(decideDueLifecycleEmail(user({ email: null }), NOW)).toBeNull()
  })

  it("sends the day-1 brief nudge to a 2-day-old user who captured but never inserted a brief", () => {
    expect(decideDueLifecycleEmail(user({ createdAtMs: NOW - 2 * DAY }), NOW)).toBe("day1_brief")
  })

  it("does not send day-1 once the user has viewed a brief", () => {
    expect(decideDueLifecycleEmail(user({ hasBriefViewed: true }), NOW)).toBeNull()
  })

  it("sends the day-3 agent nudge when MCP is not connected", () => {
    const u = user({ createdAtMs: NOW - 4 * DAY, lastCaptureAtMs: NOW - 1 * DAY })
    expect(decideDueLifecycleEmail(u, NOW)).toBe("day3_agent")
  })

  it("skips day-3 when MCP is already connected", () => {
    const u = user({ createdAtMs: NOW - 4 * DAY, hasMcp: true, lastCaptureAtMs: NOW - 1 * DAY })
    expect(decideDueLifecycleEmail(u, NOW)).toBeNull()
  })

  it("sends the day-7 recap to an active week-old user", () => {
    const u = user({ createdAtMs: NOW - 8 * DAY, lastCaptureAtMs: NOW - 1 * DAY, hasMcp: true })
    expect(decideDueLifecycleEmail(u, NOW)).toBe("day7_recap")
  })

  it("prioritizes reactivation for a user idle 10+ days", () => {
    const u = user({ createdAtMs: NOW - 20 * DAY, lastCaptureAtMs: NOW - 12 * DAY })
    expect(decideDueLifecycleEmail(u, NOW)).toBe("reactivation_v1")
  })

  it("returns null for a brand-new user younger than a day", () => {
    expect(decideDueLifecycleEmail(user({ createdAtMs: NOW - 6 * 3_600_000 }), NOW)).toBeNull()
  })

  it("returns null for an old, never-cooled user outside every window", () => {
    const u = user({ createdAtMs: NOW - 40 * DAY, lastCaptureAtMs: NOW - 1 * DAY, hasMcp: true })
    expect(decideDueLifecycleEmail(u, NOW)).toBeNull()
  })
})
