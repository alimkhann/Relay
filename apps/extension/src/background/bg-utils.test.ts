import { describe, expect, it, vi } from "vitest"

import {
  createPendingOnboardingState,
  formatUpdatedLabel,
  isAuthFailureMessage,
  retryRemote,
} from "./bg-utils"

describe("formatUpdatedLabel", () => {
  it("returns null for empty / invalid / future timestamps", () => {
    expect(formatUpdatedLabel(null)).toBeNull()
    expect(formatUpdatedLabel("not-a-date")).toBeNull()
    expect(formatUpdatedLabel(new Date(Date.now() + 60_000).toISOString())).toBeNull()
  })

  it("formats relative buckets", () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
    expect(formatUpdatedLabel(ago(30_000))).toBe("a moment ago")
    expect(formatUpdatedLabel(ago(5 * 60_000))).toBe("5 min ago")
    expect(formatUpdatedLabel(ago(3 * 3_600_000))).toBe("3 hr ago")
    expect(formatUpdatedLabel(ago(2 * 86_400_000))).toBe("2 days ago")
    expect(formatUpdatedLabel(ago(86_400_000))).toBe("1 day ago")
  })
})

describe("isAuthFailureMessage", () => {
  it("matches known auth-failure phrases case-insensitively", () => {
    expect(isAuthFailureMessage("Authentication is required")).toBe(true)
    expect(isAuthFailureMessage("ACCOUNT NOT FOUND")).toBe(true)
    expect(isAuthFailureMessage("invalid session token")).toBe(true)
    expect(isAuthFailureMessage("rate limited")).toBe(false)
  })
})

describe("createPendingOnboardingState", () => {
  it("returns a fresh pending state", () => {
    expect(createPendingOnboardingState()).toEqual({
      status: "pending",
      completedProjectId: null,
      completedVia: null,
      completedAt: null,
    })
  })
})

describe("retryRemote", () => {
  it("returns on first success without retrying", async () => {
    const task = vi.fn().mockResolvedValue("ok")
    await expect(retryRemote(task, 4)).resolves.toBe("ok")
    expect(task).toHaveBeenCalledTimes(1)
  })

  it("retries then succeeds", async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("ok")
    await expect(retryRemote(task, 2)).resolves.toBe("ok")
    expect(task).toHaveBeenCalledTimes(2)
  })

  it("throws the last error after exhausting attempts", async () => {
    const task = vi.fn().mockRejectedValue(new Error("permanent"))
    await expect(retryRemote(task, 2)).rejects.toThrow("permanent")
    expect(task).toHaveBeenCalledTimes(2)
  })
})
