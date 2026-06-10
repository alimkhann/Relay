import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { relayFetchMock } = vi.hoisted(() => ({ relayFetchMock: vi.fn() }))

vi.mock("../utils/api", () => ({
  relayFetch: relayFetchMock,
  readRateLimitError: vi.fn(),
}))

import { RETRY_DRAIN_DELAY_MS, scheduleDrain } from "./drain-scheduler"

describe("scheduleDrain", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    relayFetchMock.mockReset()
    relayFetchMock.mockResolvedValue({ ok: true })
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it("exposes the retry delay constant", () => {
    expect(RETRY_DRAIN_DELAY_MS).toBe(15_000)
  })

  it("coalesces multiple projects into a single batched drain after the delay", async () => {
    scheduleDrain("p1", 1_000)
    scheduleDrain("p2", 1_000)
    expect(relayFetchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(relayFetchMock).toHaveBeenCalledTimes(2)
    expect(relayFetchMock).toHaveBeenCalledWith("/api/projects/p1/drain", { method: "POST" })
    expect(relayFetchMock).toHaveBeenCalledWith("/api/projects/p2/drain", { method: "POST" })
  })

  it("reschedules to the sooner delay when a shorter one arrives", async () => {
    scheduleDrain("p1", 10_000)
    scheduleDrain("p2", 1_000) // shorter — should win
    await vi.advanceTimersByTimeAsync(1_000)
    expect(relayFetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not throw when a drain request rejects", async () => {
    relayFetchMock.mockRejectedValue(new Error("boom"))
    scheduleDrain("p1", 1_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(relayFetchMock).toHaveBeenCalledWith("/api/projects/p1/drain", { method: "POST" })
  })
})
