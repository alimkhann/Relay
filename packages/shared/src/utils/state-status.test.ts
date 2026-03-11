import { describe, expect, it } from "vitest"

import { deriveProjectStateStatus } from "./state-status"

describe("deriveProjectStateStatus", () => {
  it("reports pending when raw captures exist without digests or state", () => {
    const status = deriveProjectStateStatus({
      sessions: [{ capturedAt: "2026-03-11T00:00:00.000Z" }],
      digests: [],
      projectState: null,
      digestJobs: []
    })

    expect(status.rawCapturePresent).toBe(true)
    expect(status.digestStatus).toBe("pending")
    expect(status.projectStateReady).toBe(false)
  })

  it("surfaces timed out digest jobs until state is ready", () => {
    const status = deriveProjectStateStatus({
      sessions: [{ capturedAt: "2026-03-11T00:00:00.000Z" }],
      digests: [],
      projectState: null,
      digestJobs: [
        {
          id: "job-1",
          status: "timed_out",
          errorMessage: "Relay marked this job as timed out before retrying it.",
          createdAt: "2026-03-11T00:01:00.000Z",
          completedAt: "2026-03-11T00:06:00.000Z",
          attempts: 1,
          fallbackUsed: false,
          outputPayload: {
            jobStage: "timed_out",
            fallbackPlanned: true
          }
        }
      ]
    })

    expect(status.digestStatus).toBe("timed_out")
    expect(status.digestErrorMessage).toContain("timed out")
  })

  it("surfaces the active job diagnostics for pending work", () => {
    const status = deriveProjectStateStatus({
      sessions: [{ capturedAt: "2026-03-11T00:00:00.000Z" }],
      digests: [],
      projectState: null,
      digestJobs: [
        {
          id: "job-2",
          status: "running",
          errorMessage: null,
          createdAt: "2026-03-11T00:01:00.000Z",
          completedAt: null,
          attempts: 2,
          fallbackUsed: true,
          outputPayload: {
            jobStage: "generate_fallback",
            fallbackPlanned: true
          }
        }
      ]
    })

    expect(status.activeJobId).toBe("job-2")
    expect(status.activeJobStatus).toBe("running")
    expect(status.activeJobStage).toBe("generate_fallback")
    expect(status.activeJobAttempts).toBe(2)
    expect(status.fallbackPlanned).toBe(true)
    expect(status.fallbackUsed).toBe(true)
  })
})
