import { describe, expect, it } from "vitest"

import type { ProjectStateStatusDto } from "@relay/shared"

import {
  createEmptyAssociationToast,
  createEmptyChatAssociation,
  createEmptyContextPreview,
  createEmptyInsertState,
  createEmptyTrustMetadata,
  decideShortcutAction,
  deriveRelayActiveProjectState,
  looksLikeFreshChatRoute,
  shouldScheduleAutoCapture,
  shouldScheduleAutoCaptureRouting,
} from "./tab-state"

function makeCompletedOnboarding() {
  return {
    status: "completed" as const,
    completedProjectId: "project_123",
    completedVia: "web" as const,
    completedAt: "2026-03-11T00:00:00.000Z"
  }
}

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

describe("deriveRelayActiveProjectState", () => {
  it("keeps ready state while remote data is stale if a last good state exists", () => {
    const state = deriveRelayActiveProjectState({
      connected: true,
      projectId: "project_123",
      projectName: "Relay",
      projectOptions: [{ id: "project_123", name: "Relay" }],
      showCue: true,
      page: {
        supported: true,
        platform: "chatgpt",
        promptReady: true,
        isFreshChat: true
      },
      onboarding: makeCompletedOnboarding(),
      stateStatus: makeStateStatus(),
      trust: createEmptyTrustMetadata(),
      remoteStatus: "stale",
      lastSuccessfulSyncAt: "2026-03-12T00:00:00.000Z",
      capturePending: false,
      capturePendingAt: null,
      contextPreview: createEmptyContextPreview(),
      chatAssociation: createEmptyChatAssociation(),
      routingReview: null,
      associationTier: "none",
      associationToast: createEmptyAssociationToast(),
      associationSuppressed: false,
      insertState: createEmptyInsertState(),
      lastError: "Failed to fetch"
    })

    expect(state.status).toBe("ready")
    expect(state.canInsert).toBe(true)
    expect(state.issue?.kind).toBe("network")
  })

  it("surfaces a digest issue before a ready state exists", () => {
    const state = deriveRelayActiveProjectState({
      connected: true,
      projectId: "project_123",
      projectName: "Relay",
      projectOptions: [{ id: "project_123", name: "Relay" }],
      showCue: true,
      page: {
        supported: true,
        platform: "chatgpt",
        promptReady: true,
        isFreshChat: true
      },
      onboarding: makeCompletedOnboarding(),
      stateStatus: makeStateStatus({
        digestStatus: "failed",
        projectStateReady: false,
        activeJobStatus: "failed",
        digestErrorMessage: "Gemini returned invalid JSON."
      }),
      trust: createEmptyTrustMetadata(),
      remoteStatus: "ready",
      lastSuccessfulSyncAt: "2026-03-12T00:00:00.000Z",
      capturePending: false,
      capturePendingAt: null,
      contextPreview: createEmptyContextPreview(),
      chatAssociation: createEmptyChatAssociation(),
      routingReview: null,
      associationTier: "none",
      associationToast: createEmptyAssociationToast(),
      associationSuppressed: false,
      insertState: createEmptyInsertState(),
    })

    expect(state.status).toBe("unavailable")
    expect(state.issue?.kind).toBe("digest")
    expect(state.issue?.detail).toContain("Gemini returned invalid JSON.")
  })
})

describe("view states", () => {
  it("uses connected-loading instead of empty onboarding while cached project identity is still revalidating", () => {
    const state = deriveRelayActiveProjectState({
      connected: true,
      projectId: "project_123",
      projectName: "Relay",
      projectOptions: [{ id: "project_123", name: "Relay" }],
      showCue: true,
      page: {
        supported: true,
        platform: "chatgpt",
        promptReady: true,
        isFreshChat: false
      },
      onboarding: makeCompletedOnboarding(),
      stateStatus: makeStateStatus({
        projectStateReady: false,
        rawCapturePresent: false,
        digestStatus: "idle"
      }),
      trust: createEmptyTrustMetadata(),
      remoteStatus: "loading",
      lastSuccessfulSyncAt: null,
      capturePending: false,
      capturePendingAt: null,
      contextPreview: createEmptyContextPreview(),
      chatAssociation: createEmptyChatAssociation(),
      routingReview: null,
      associationTier: "none",
      associationToast: createEmptyAssociationToast(),
      associationSuppressed: false,
      insertState: createEmptyInsertState(),
    })

    expect(state.viewState).toBe("connected-loading")
    expect(state.message).toBe("Checking this chat…")
  })

  it("uses onboarding state instead of project count to show setup", () => {
    const state = deriveRelayActiveProjectState({
      connected: true,
      projectId: null,
      projectName: null,
      projectOptions: [],
      showCue: true,
      page: {
        supported: false
      },
      onboarding: {
        status: "pending",
        completedProjectId: null,
        completedVia: null,
        completedAt: null
      },
      stateStatus: null,
      trust: createEmptyTrustMetadata(),
      remoteStatus: "ready",
      lastSuccessfulSyncAt: null,
      capturePending: false,
      capturePendingAt: null,
      contextPreview: createEmptyContextPreview(),
      chatAssociation: createEmptyChatAssociation(),
      routingReview: null,
      associationTier: "none",
      associationToast: createEmptyAssociationToast(),
      associationSuppressed: false,
      insertState: createEmptyInsertState(),
    })

    expect(state.viewState).toBe("connected-empty")
  })
})

describe("shouldScheduleAutoCapture", () => {
  it("requires a stable non-fresh page with a new signature, even when the turn count stays the same", () => {
    expect(
      shouldScheduleAutoCapture({
        page: {
          supported: true,
          platform: "chatgpt",
          isFreshChat: false,
          isStable: true,
          isStreaming: false,
          turns: 6,
          captureSignature: "sig_2",
          recentUserTurnText: "Refine the continuity sidebar and keyboard dismiss flow.",
          fullVisibleRoutingText:
            "user: Refine the continuity sidebar and keyboard dismiss flow for the quiet assistant rewrite across surfaces."
        },
        capturePending: false,
        lastCapturedSignature: "sig_1",
        lastCapturedTurns: 6
      })
    ).toBe(true)

    expect(
      shouldScheduleAutoCapture({
        page: {
          supported: true,
          platform: "chatgpt",
          isFreshChat: false,
          isStable: false,
          isStreaming: false,
          turns: 6,
          captureSignature: "sig_2",
          recentUserTurnText: "Refine the continuity sidebar and keyboard dismiss flow.",
          fullVisibleRoutingText:
            "user: Refine the continuity sidebar and keyboard dismiss flow for the quiet assistant rewrite across surfaces."
        },
        capturePending: false,
        lastCapturedSignature: "sig_1",
        lastCapturedTurns: 4
      })
    ).toBe(false)
  })
})

describe("shouldScheduleAutoCaptureRouting", () => {
  it("waits for routing inputs before classifying an existing chat, then reruns once projects are available", () => {
    const page = {
      supported: true,
      platform: "chatgpt" as const,
      isFreshChat: false,
      isStable: true,
      isStreaming: false,
      turns: 6,
      captureSignature: "sig_2",
      recentUserTurnText: "Refine the continuity sidebar and keyboard dismiss flow.",
      fullVisibleRoutingText:
        "user: Refine the continuity sidebar and keyboard dismiss flow for the quiet assistant rewrite across surfaces."
    }

    expect(
      shouldScheduleAutoCaptureRouting({
        page,
        capturePending: false,
        lastCapturedSignature: "sig_1",
        lastCapturedTurns: 4,
        lastRoutedSignature: null,
        associationStatus: "none",
        associationSuppressed: false,
        projectOptionsCount: 0,
        sessionProjectOptionsCount: 0
      })
    ).toBe(false)

    expect(
      shouldScheduleAutoCaptureRouting({
        page,
        capturePending: false,
        lastCapturedSignature: "sig_1",
        lastCapturedTurns: 4,
        lastRoutedSignature: null,
        associationStatus: "none",
        associationSuppressed: false,
        projectOptionsCount: 1,
        sessionProjectOptionsCount: 0
      })
    ).toBe(true)
  })
})

describe("looksLikeFreshChatRoute", () => {
  it("treats project-root starter pages as fresh insertion surfaces", () => {
    expect(
      looksLikeFreshChatRoute({
        supported: true,
        platform: "chatgpt",
        routeKind: "project_root",
        pathname: "/g/g-123/project",
      }),
    ).toBe(true)
  })
})

describe("decideShortcutAction", () => {
  it("restores a dismissed fresh chip, triggers insert on a visible chip, and opens a continuation chip on existing chats", () => {
    expect(
      decideShortcutAction({
        chipVisible: false,
        dismissed: true,
        page: {
          supported: true,
          promptReady: true,
          isFreshChat: true
        }
      })
    ).toBe("restore_hidden_fresh")

    expect(
      decideShortcutAction({
        chipVisible: true,
        dismissed: false,
        page: {
          supported: true,
          promptReady: true,
          isFreshChat: false
        }
      })
    ).toBe("trigger_visible_insert")

    expect(
      decideShortcutAction({
        chipVisible: false,
        dismissed: false,
        page: {
          supported: true,
          promptReady: true,
          isFreshChat: false
        }
      })
    ).toBe("show_existing_chip")
  })
})
