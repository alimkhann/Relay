import { beforeEach, describe, expect, it, vi } from "vitest"

const { readDormancySnapshotMock } = vi.hoisted(() => ({
  readDormancySnapshotMock: vi.fn(),
}))

vi.mock("../storage/dormancy", async () => {
  const actual = await vi.importActual("../storage/dormancy")
  return {
    ...(actual as Record<string, unknown>),
    readDormancySnapshot: readDormancySnapshotMock,
  }
})

import { createPageController } from "./page-controller"
import { tabStates } from "./state"

describe("createPageController dormancy gate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tabStates.clear()
    readDormancySnapshotMock.mockResolvedValue({
      dormant: true,
      state: {
        lastMeaningfulActivityAt: null,
        lastMeaningfulActivityKind: null,
        enteredDormantAt: null,
        autoWakeAttempts: { day: null, count: 0, signatures: {} },
      },
    })
    vi.stubGlobal("chrome", {
      tabs: {
        sendMessage: vi.fn().mockResolvedValue({
          supported: true,
          platform: "chatgpt",
          url: "https://chatgpt.com/c/relay",
          domain: "chatgpt.com",
          pathname: "/c/relay",
          isFreshChat: false,
          isStable: true,
          isStreaming: false,
          turns: 4,
          captureSignature: "sig-1",
        }),
        get: vi.fn(),
      },
      scripting: {
        executeScript: vi.fn(),
      },
      runtime: {
        getManifest: vi.fn(() => ({ content_scripts: [{ js: [] }] })),
      },
    })
  })

  it("does not sync missing remote state from passive page refresh while dormant", async () => {
    const syncTabRemoteState = vi.fn().mockResolvedValue(undefined)
    const controller = createPageController({ syncTabRemoteState })

    await controller.refreshPageStateAndSyncIfMissing(7, "tab_focus")

    expect(syncTabRemoteState).not.toHaveBeenCalled()
  })

  it("syncs missing remote state from passive page refresh when not dormant", async () => {
    readDormancySnapshotMock.mockResolvedValue({
      dormant: false,
      state: {
        lastMeaningfulActivityAt: Date.UTC(2026, 5, 23),
        lastMeaningfulActivityKind: "sidepanel_opened",
        enteredDormantAt: null,
        autoWakeAttempts: { day: null, count: 0, signatures: {} },
      },
    })
    const syncTabRemoteState = vi.fn().mockResolvedValue(undefined)
    const controller = createPageController({ syncTabRemoteState })

    await controller.refreshPageStateAndSyncIfMissing(7, "tab_focus")

    expect(syncTabRemoteState).toHaveBeenCalledWith(7, { reason: "tab_focus" })
  })
})
