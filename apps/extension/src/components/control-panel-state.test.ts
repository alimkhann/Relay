import { describe, expect, it } from "vitest"

import type { ProjectStateStatusDto } from "@relay/shared"

import {
  deriveAssociationCardPresentation,
  deriveControlPanelState,
  deriveUnresolvedAssociationCardPresentation,
  shouldShowAssociationCard,
} from "./control-panel-state"

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
  it("shows ready for this chat only when a fresh chat has ready project state and no active digest", () => {
    const state = deriveControlPanelState({
      connected: true,
      supported: true,
      freshChat: true,
      stateStatus: makeStateStatus()
    })

    expect(state.heroBadge).toBe("Ready for this chat")
    expect(state.insertDisabled).toBe(false)
    expect(state.freshBootstrapReady).toBe(true)
  })

  it("shows updating while the brief is still being prepared", () => {
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

    expect(state.heroBadge).toBe("Updating your project brief")
    expect(state.insertDisabled).toBe(true)
    expect(state.stageLabel).toBe("Generating")
  })

  it("shows unavailable when a fresh chat does not have a ready brief", () => {
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

    expect(state.heroBadge).toBe("Project brief unavailable")
    expect(state.insertDisabled).toBe(true)
  })
})

describe("deriveAssociationCardPresentation", () => {
  it("keeps ignored chats on a single manual association message", () => {
    const presentation = deriveAssociationCardPresentation({
      status: "ignored",
      projectId: null,
      projectName: null,
      sessionId: null,
      reason: "Relay will ignore this chat until you manually associate it.",
      capturedAt: null,
    })

    expect(presentation.summary).toBe(
      "Relay will ignore this chat until you manually associate it.",
    )
    expect(presentation.showMeta).toBe(false)
  })

  it("keeps held chats on the approval copy path", () => {
    const presentation = deriveAssociationCardPresentation({
      status: "held",
      projectId: "project_123",
      projectName: "Relay",
      sessionId: null,
      reason: "Relay wants confirmation before saving this chat to a project.",
      capturedAt: null,
    })

    expect(presentation.summary).toContain("waiting for your approval")
    expect(presentation.showMeta).toBe(true)
  })
})

describe("association card helpers", () => {
  it("shows the association card for supported existing chats even before a chat is associated", () => {
    expect(
      shouldShowAssociationCard({
        onboardingStatus: "completed",
        supported: true,
        freshChat: false,
        turns: 4,
      })
    ).toBe(true)

    expect(
      shouldShowAssociationCard({
        onboardingStatus: "completed",
        supported: true,
        freshChat: true,
        turns: 0,
      })
    ).toBe(false)
  })

  it("describes unresolved existing chats differently while routing is still in flight", () => {
    expect(
      deriveUnresolvedAssociationCardPresentation({
        projectName: "Relay",
        checking: true,
      }).summary
    ).toBe("Checking association…")

    expect(
      deriveUnresolvedAssociationCardPresentation({
        projectName: "Relay",
        checking: false,
      }).summary
    ).toContain("not associated yet")
  })
})
