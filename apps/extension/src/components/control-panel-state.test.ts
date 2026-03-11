import { describe, expect, it } from "vitest"

import type { ProjectStateStatusDto } from "@relay/shared"

import { deriveControlPanelState } from "./control-panel-state"

function makeStateStatus(input: Partial<ProjectStateStatusDto> = {}): ProjectStateStatusDto {
  return {
    rawCapturePresent: true,
    digestStatus: "completed",
    projectStateReady: true,
    digestErrorMessage: null,
    lastCapturedAt: "2026-03-11T00:00:00.000Z",
    lastDigestAt: "2026-03-11T00:01:00.000Z",
    activeJobId: null,
    activeJobStatus: "completed",
    activeJobStage: "completed",
    activeJobAttempts: 1,
    fallbackPlanned: true,
    fallbackUsed: false,
    ...input
  }
}

describe("deriveControlPanelState", () => {
  it("shows bootstrap ready only when a fresh chat has ready project state and no active digest", () => {
    const state = deriveControlPanelState({
      connected: true,
      supported: true,
      freshChat: true,
      stateStatus: makeStateStatus()
    })

    expect(state.heroBadge).toBe("Bootstrap ready")
    expect(state.insertDisabled).toBe(false)
    expect(state.freshBootstrapReady).toBe(true)
  })

  it("shows digest pending and disables insert while the digest is still running", () => {
    const state = deriveControlPanelState({
      connected: true,
      supported: true,
      freshChat: true,
      stateStatus: makeStateStatus({
        digestStatus: "running",
        projectStateReady: false,
        activeJobStatus: "running",
        activeJobStage: "generate_primary"
      })
    })

    expect(state.heroBadge).toBe("Digest pending")
    expect(state.insertDisabled).toBe(true)
    expect(state.stageLabel).toBe("Generating")
  })

  it("shows digest failure explicitly on a fresh chat", () => {
    const state = deriveControlPanelState({
      connected: true,
      supported: true,
      freshChat: true,
      stateStatus: makeStateStatus({
        digestStatus: "failed",
        projectStateReady: false,
        activeJobStatus: "failed",
        activeJobStage: "generate_fallback",
        digestErrorMessage: "Gemini returned invalid JSON."
      })
    })

    expect(state.heroBadge).toBe("Digest failed")
    expect(state.insertDisabled).toBe(true)
  })
})
