import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  canAttemptDormantAutoWakeMock,
  getRelaySessionMock,
  readApprovedAssociationsMock,
  readDormancySnapshotMock,
  rememberDormantAutoWakeAttemptMock,
} = vi.hoisted(() => ({
  canAttemptDormantAutoWakeMock: vi.fn(),
  getRelaySessionMock: vi.fn(),
  readApprovedAssociationsMock: vi.fn(),
  readDormancySnapshotMock: vi.fn(),
  rememberDormantAutoWakeAttemptMock: vi.fn(),
}))

vi.mock("../storage/session", () => ({
  getRelaySession: getRelaySessionMock,
}))

vi.mock("../storage/dormancy", async () => {
  const actual = await vi.importActual("../storage/dormancy")
  return {
    ...(actual as Record<string, unknown>),
    canAttemptDormantAutoWake: canAttemptDormantAutoWakeMock,
    readDormancySnapshot: readDormancySnapshotMock,
    rememberDormantAutoWakeAttempt: rememberDormantAutoWakeAttemptMock,
  }
})

vi.mock("../storage/routing", async () => {
  const actual = await vi.importActual("../storage/routing")
  return {
    ...(actual as Record<string, unknown>),
    readApprovedAssociations: readApprovedAssociationsMock,
  }
})

import { configureCaptureScheduler, evaluateDormantAutoCapture, scheduleAutoCapture } from "./capture-scheduler"
import { tabStates } from "./state"
import { createEmptyChatAssociation } from "./tab-state"
import { getOrCreateTabState } from "./tab-state-store"

const basePage = {
  supported: true,
  platform: "chatgpt" as const,
  pathname: "/c/relay-work",
  title: "Relay continuity sidebar work",
  isFreshChat: false,
  isStable: true,
  isStreaming: false,
  turns: 6,
  captureSignature: "sig-2",
  recentRoutingText:
    "Relay continuity sidebar work\nuser: For Relay, refine the continuity sidebar capture and quiet assistant rewrite.",
  recentUserTurnText:
    "For Relay, refine the continuity sidebar capture and quiet assistant rewrite.",
}

const relayProject = {
  id: "project_relay",
  name: "Relay",
  slug: "relay",
  memoryCount: 10,
  sessionCount: 5,
  description: "AI memory extension with continuity sidebar and capture.",
  routingContext: {
    hasMeaningfulContext: true,
    keywords: ["continuity", "sidebar", "capture", "assistant", "rewrite", "extension"],
  },
}

function dormantSnapshot() {
  return {
    dormant: true,
    state: {
      lastMeaningfulActivityAt: null,
      lastMeaningfulActivityKind: null,
      enteredDormantAt: Date.UTC(2026, 5, 23),
      autoWakeAttempts: { day: null, count: 0, signatures: {} },
    },
  }
}

function sessionWithProjects() {
  return {
    token: "token",
    connected: true,
    projectId: "project_relay",
    assumedProjectId: "project_relay",
    assumedProjectName: "Relay",
    projectOptions: [relayProject],
    stateStatus: null,
    trust: {
      updatedAt: null,
      updatedLabel: null,
      recentChatCount: 0,
      savedContextCount: 0,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  tabStates.clear()
  getRelaySessionMock.mockResolvedValue(sessionWithProjects())
  readDormancySnapshotMock.mockResolvedValue(dormantSnapshot())
  readApprovedAssociationsMock.mockResolvedValue([])
  canAttemptDormantAutoWakeMock.mockReturnValue(true)
  rememberDormantAutoWakeAttemptMock.mockResolvedValue(dormantSnapshot().state)
})

describe("evaluateDormantAutoCapture", () => {
  it("allows a saved chat with a changed signature", () => {
    const result = evaluateDormantAutoCapture({
      dormant: true,
      page: basePage,
      chatAssociation: {
        ...createEmptyChatAssociation(),
        status: "saved",
        projectId: "project_relay",
      },
      associationSuppressed: false,
      projectOptions: [relayProject],
      sessionProjectOptions: [relayProject],
      selectedProjectId: "project_relay",
      approvedAssociations: [],
      lastCapturedSignature: "sig-1",
      lastRoutedSignature: "sig-1",
      canAttemptSignature: true,
    })

    expect(result.allowed).toBe(true)
    expect(result.reason).toBe("saved_chat")
  })

  it("allows only high-confidence local routing for dormant new chats", () => {
    const result = evaluateDormantAutoCapture({
      dormant: true,
      page: basePage,
      chatAssociation: createEmptyChatAssociation(),
      associationSuppressed: false,
      projectOptions: [relayProject],
      sessionProjectOptions: [relayProject],
      selectedProjectId: "project_relay",
      approvedAssociations: [],
      lastCapturedSignature: "sig-1",
      lastRoutedSignature: null,
      canAttemptSignature: true,
    })

    expect(result.allowed).toBe(true)
    expect(result.reason).toBe("high_confidence_local_relevance")
    expect(result.routingDecision?.mode).toBe("auto-save")
  })

  it("blocks medium local routing while dormant", () => {
    const result = evaluateDormantAutoCapture({
      dormant: true,
      page: {
        ...basePage,
        title: "Relay launch checklist",
        recentRoutingText:
          "Relay launch checklist\nuser: List the remaining work for Relay onboarding and project capture.",
        recentUserTurnText: "List the remaining work for Relay onboarding and project capture.",
      },
      chatAssociation: createEmptyChatAssociation(),
      associationSuppressed: false,
      projectOptions: [
        {
          id: "project_relay",
          name: "Relay",
          slug: "relay",
          memoryCount: 0,
          sessionCount: 0,
          routingContext: { hasMeaningfulContext: false, keywords: [] },
        },
      ],
      sessionProjectOptions: [],
      selectedProjectId: null,
      approvedAssociations: [],
      lastCapturedSignature: "sig-1",
      lastRoutedSignature: null,
      canAttemptSignature: true,
    })

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe("local_relevance_not_high_confidence")
    expect(result.routingDecision?.mode).toBe("hold")
  })

  it("blocks unrelated dormant chats", () => {
    const result = evaluateDormantAutoCapture({
      dormant: true,
      page: {
        ...basePage,
        title: "Fat loss reality check",
        recentRoutingText:
          "Fat loss reality check\nuser: How much protein and daily walking do I need during Ramadan?",
        recentUserTurnText: "How much protein and daily walking do I need during Ramadan?",
      },
      chatAssociation: createEmptyChatAssociation(),
      associationSuppressed: false,
      projectOptions: [relayProject],
      sessionProjectOptions: [],
      selectedProjectId: "project_relay",
      approvedAssociations: [],
      lastCapturedSignature: "sig-1",
      lastRoutedSignature: null,
      canAttemptSignature: true,
    })

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe("local_relevance_not_high_confidence")
    expect(result.routingDecision?.mode).toBe("ignore")
  })
})

describe("scheduleAutoCapture dormant capture routing", () => {
  it("passes the locally routed project id into dormant high-confidence auto-capture", async () => {
    const captureObservedChange = vi.fn().mockResolvedValue({ ok: true })
    configureCaptureScheduler({
      broadcastActiveProjectState: vi.fn().mockResolvedValue(undefined),
      captureObservedChange,
    })
    const state = getOrCreateTabState(7)
    state.page = basePage
    state.projectId = null
    state.projectOptions = [relayProject]
    state.chatAssociation = createEmptyChatAssociation()
    state.lastCapturedSignature = "sig-1"

    await scheduleAutoCapture(7, { immediate: true })

    expect(captureObservedChange).toHaveBeenCalledWith(
      7,
      "project_relay",
      expect.objectContaining({
        autoCapture: true,
        skipAssociationAdjudication: true,
      }),
    )
    expect(rememberDormantAutoWakeAttemptMock).toHaveBeenCalledWith("sig-2")
  })

  it("does not consume a dormant auto-wake attempt when a capture timer blocks scheduling", async () => {
    const captureObservedChange = vi.fn().mockResolvedValue({ ok: true })
    configureCaptureScheduler({
      broadcastActiveProjectState: vi.fn().mockResolvedValue(undefined),
      captureObservedChange,
    })
    const state = getOrCreateTabState(9)
    state.page = basePage
    state.projectId = null
    state.projectOptions = [relayProject]
    state.chatAssociation = createEmptyChatAssociation()
    state.lastCapturedSignature = "sig-1"
    state.captureTimer = setTimeout(() => undefined, 10_000)

    await scheduleAutoCapture(9, { immediate: true })
    clearTimeout(state.captureTimer)
    state.captureTimer = null

    expect(captureObservedChange).not.toHaveBeenCalled()
    expect(rememberDormantAutoWakeAttemptMock).not.toHaveBeenCalled()
  })

  it("passes the saved project id into dormant saved-chat recapture", async () => {
    vi.useFakeTimers()
    const captureObservedChange = vi.fn().mockResolvedValue({ ok: true })
    configureCaptureScheduler({
      broadcastActiveProjectState: vi.fn().mockResolvedValue(undefined),
      captureObservedChange,
    })
    const state = getOrCreateTabState(8)
    state.page = basePage
    state.projectId = null
    state.chatAssociation = {
      ...createEmptyChatAssociation(),
      status: "saved",
      projectId: "project_relay",
      projectName: "Relay",
    }
    state.lastCapturedSignature = "sig-1"

    await scheduleAutoCapture(8, { immediate: true })
    await vi.runOnlyPendingTimersAsync()

    expect(captureObservedChange).toHaveBeenCalledWith(
      8,
      "project_relay",
      expect.objectContaining({
        autoCapture: true,
        skipAssociationAdjudication: true,
      }),
    )
    vi.useRealTimers()
  })
})
