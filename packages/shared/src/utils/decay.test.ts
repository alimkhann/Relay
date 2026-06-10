import { describe, expect, it } from "vitest"

import {
  computeDecayMultiplier,
  daysBetween,
  proposeLifecycleTransition,
  RECENT_WRITE_PROTECTION_DAYS,
  type DecayableItem,
} from "./decay"

const NOW = new Date("2026-01-01T00:00:00.000Z")
const HALF_LIVES = { note: 10, observation: 10 }

function daysAgo(days: number, from: Date = NOW): string {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

function item(overrides: Partial<DecayableItem> = {}): DecayableItem {
  return {
    id: "m1",
    content: "some fact",
    type: "note",
    capturedAt: daysAgo(60),
    createdAt: daysAgo(60),
    lastReaffirmedAt: null,
    pinned: false,
    metadata: {},
    ...overrides,
  }
}

describe("daysBetween", () => {
  it("returns positive day count for a past anchor", () => {
    expect(daysBetween(daysAgo(5), NOW)).toBeCloseTo(5, 5)
  })

  it("clamps a future anchor to 0", () => {
    expect(daysBetween(daysAgo(-5), NOW)).toBe(0)
  })

  it("returns 0 for an unparseable date", () => {
    expect(daysBetween("not-a-date", NOW)).toBe(0)
  })
})

describe("computeDecayMultiplier", () => {
  it("returns 1.0 for pinned items regardless of age", () => {
    expect(computeDecayMultiplier(item({ pinned: true }), HALF_LIVES, NOW)).toBe(1.0)
  })

  it("returns 1.0 when no anchor date is present", () => {
    const anchorless = item({ capturedAt: null, createdAt: null, lastReaffirmedAt: null })
    expect(computeDecayMultiplier(anchorless, HALF_LIVES, NOW)).toBe(1.0)
  })

  it("returns ~1.0 for a just-written item", () => {
    const fresh = item({ capturedAt: daysAgo(0), createdAt: daysAgo(0) })
    expect(computeDecayMultiplier(fresh, HALF_LIVES, NOW)).toBeCloseTo(1.0, 2)
  })

  it("decays toward the floor for very old items but never below 0.001", () => {
    const ancient = item({ capturedAt: daysAgo(1000), createdAt: daysAgo(1000) })
    const m = computeDecayMultiplier(ancient, HALF_LIVES, NOW)
    expect(m).toBeGreaterThanOrEqual(0.001)
    expect(m).toBeLessThan(0.05)
  })

  it("uses lastReaffirmedAt as the anchor when present (resets the clock)", () => {
    // A 1-day-old reaffirm against a 100-day-old capture: anchored on the
    // reaffirm => exp(-1/10) ≈ 0.90, not the near-zero a 100-day age would give.
    const reaffirmed = item({ capturedAt: daysAgo(100), lastReaffirmedAt: daysAgo(1) })
    const m = computeDecayMultiplier(reaffirmed, HALF_LIVES, NOW)
    expect(m).toBeGreaterThan(0.85)
  })
})

describe("proposeLifecycleTransition", () => {
  it("never proposes a transition for pinned items", () => {
    const t = proposeLifecycleTransition(item({ pinned: true, capturedAt: daysAgo(500) }), {
      halfLifeDays: HALF_LIVES,
      now: NOW,
    })
    expect(t).toBeNull()
  })

  it("protects items with human_explicit authority", () => {
    const t = proposeLifecycleTransition(
      item({ capturedAt: daysAgo(500), metadata: { authority: "human_explicit" } }),
      { halfLifeDays: HALF_LIVES, now: NOW },
    )
    expect(t).toBeNull()
  })

  it("protects items written within the recent-write window", () => {
    const recent = item({
      capturedAt: daysAgo(RECENT_WRITE_PROTECTION_DAYS - 1),
      createdAt: daysAgo(RECENT_WRITE_PROTECTION_DAYS - 1),
    })
    expect(proposeLifecycleTransition(recent, { halfLifeDays: HALF_LIVES, now: NOW })).toBeNull()
  })

  it("proposes archived when decay and truth are both below the archive thresholds", () => {
    // age 40 / halflife 10 => exp(-4) ≈ 0.018 < 0.05; truth 0 < 20.
    const t = proposeLifecycleTransition(item({ capturedAt: daysAgo(40), createdAt: daysAgo(40) }), {
      halfLifeDays: HALF_LIVES,
      now: NOW,
    })
    expect(t?.next).toBe("archived")
    expect(t?.reason).toBe("decay_below_archive_threshold")
  })

  it("proposes cooling when decay is in the cool band and not yet archive-low", () => {
    // age 23 / halflife 10 => exp(-2.3) ≈ 0.10 in [0.05, 0.2); truth 0 < 30.
    const t = proposeLifecycleTransition(item({ capturedAt: daysAgo(23), createdAt: daysAgo(23) }), {
      halfLifeDays: HALF_LIVES,
      now: NOW,
    })
    expect(t?.next).toBe("cooling")
    expect(t?.reason).toBe("decay_below_cool_threshold")
  })

  it("does not re-propose cooling for an item already cooling", () => {
    const t = proposeLifecycleTransition(item({ capturedAt: daysAgo(23), createdAt: daysAgo(23) }), {
      halfLifeDays: HALF_LIVES,
      now: NOW,
      alreadyCooling: true,
    })
    expect(t).toBeNull()
  })
})
