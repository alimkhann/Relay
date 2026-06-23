import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  markMeaningfulActivityMock,
  persistTabSignatureMock,
  rememberApprovedAssociationMock,
  setRelaySessionMock,
} = vi.hoisted(() => ({
  markMeaningfulActivityMock: vi.fn(),
  persistTabSignatureMock: vi.fn(),
  rememberApprovedAssociationMock: vi.fn(),
  setRelaySessionMock: vi.fn(),
}))

vi.mock("../storage/capture-signatures", () => ({
  persistTabSignature: persistTabSignatureMock,
}))

vi.mock("../storage/routing", () => ({
  rememberApprovedAssociation: rememberApprovedAssociationMock,
}))

vi.mock("../storage/session", () => ({
  setRelaySession: setRelaySessionMock,
}))

vi.mock("../storage/dormancy", () => ({
  markMeaningfulActivity: markMeaningfulActivityMock,
}))

vi.mock("./session-cache", () => ({
  invalidateProjectCache: vi.fn(),
}))

vi.mock("./drain-scheduler", () => ({
  RETRY_DRAIN_DELAY_MS: 30_000,
  scheduleDrain: vi.fn(),
}))

vi.mock("./telemetry", () => ({
  recordBackgroundTelemetry: vi.fn(),
}))

import { applySuccessfulCaptureResult } from "./capture-completion"
import { createTabState } from "./tab-state-store"

describe("applySuccessfulCaptureResult dormancy wake ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    persistTabSignatureMock.mockResolvedValue(undefined)
    rememberApprovedAssociationMock.mockResolvedValue(undefined)
    setRelaySessionMock.mockResolvedValue(undefined)
    markMeaningfulActivityMock.mockResolvedValue(undefined)
  })

  it("marks successful auto-capture activity before capture-complete sync", async () => {
    const calls: string[] = []
    markMeaningfulActivityMock.mockImplementation(async () => {
      calls.push("activity")
    })
    const state = createTabState(7)
    state.page = {
      supported: true,
      platform: "chatgpt",
      title: "Relay dormant mode",
      url: "https://chatgpt.com/c/relay",
      domain: "chatgpt.com",
      pathname: "/c/relay",
      isFreshChat: false,
      isStable: true,
      isStreaming: false,
      turns: 4,
      captureSignature: "sig-2",
    }
    state.projectOptions = [{
      id: "project_relay",
      name: "Relay",
      slug: "relay",
      memoryCount: 1,
      sessionCount: 1,
    }]
    const syncTabRemoteState = vi.fn().mockImplementation(async () => {
      calls.push("sync")
    })

    await applySuccessfulCaptureResult({
      result: {
        ok: true,
        sessionId: "session_1",
        turns: 4,
      },
      state,
      session: {
        targetMode: "auto",
        targetProfileKey: "",
        assumedProjectName: "Relay",
        stateStatus: null,
        projectOptions: state.projectOptions,
      } as any,
      tabId: 7,
      projectId: "project_relay",
      previousAssociationProjectName: null,
      routingCandidateProjectName: "Relay",
      chatKey: "chatgpt:path:/c/relay",
      manualSelection: false,
      skipAssociationToast: true,
      autoAssociated: true,
      autoCapture: true,
      flowId: "flow_1",
      rememberProjectSelection: vi.fn(),
      syncTabRemoteState,
      showAssociationToast: vi.fn(),
    })

    expect(calls).toEqual(["activity", "sync"])
    expect(markMeaningfulActivityMock).toHaveBeenCalledWith("auto_capture_completed")
    expect(syncTabRemoteState).toHaveBeenCalledWith(7, {
      force: true,
      reason: "capture_complete",
    })
  })
})
