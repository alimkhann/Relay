import { describe, expect, it } from "vitest"

import { compareTemporalOrder, computeElapsedDays, extractTemporalPoints, resolvePrimaryTemporalPoint } from "./temporal-normalization"

describe("temporal normalization", () => {
  it("extracts relative dates against a reference date", () => {
    const point = resolvePrimaryTemporalPoint("I attended it 10 days ago", "2026-04-20T00:00:00.000Z")
    expect(point?.isoDate).toBe("2026-04-10T00:00:00.000Z")
  })

  it("extracts explicit dates", () => {
    const points = extractTemporalPoints("The event was on March 4, 2026.")
    expect(points[0]?.isoDate).toBe("2026-03-04T00:00:00.000Z")
  })

  it("computes elapsed days and order", () => {
    expect(computeElapsedDays("2026-04-10T00:00:00.000Z", "2026-04-20T00:00:00.000Z")).toBe(10)
    expect(compareTemporalOrder("2026-04-10T00:00:00.000Z", "2026-04-20T00:00:00.000Z")).toBe("before")
  })
})
