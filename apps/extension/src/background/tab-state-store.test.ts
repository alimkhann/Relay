import { afterEach, describe, expect, it, vi } from "vitest";

import { rehydratedSignatures, tabStates } from "./state";
import {
  clearTabState,
  createTabState,
  getOrCreateTabState,
  updateTabPageState,
} from "./tab-state-store";

vi.mock("../storage/capture-signatures", () => ({
  getAllPersistedSignatures: vi.fn(async () => ({})),
  removeTabSignature: vi.fn(async () => undefined),
}));

describe("tab-state-store", () => {
  afterEach(() => {
    tabStates.clear();
    rehydratedSignatures.current = null;
  });

  it("creates unsupported tab state without remote work", () => {
    const state = createTabState(4);
    expect(state.page).toEqual({ supported: false });
    expect(state.remoteStatus).toBe("unavailable");
    expect(state.projectOptions).toEqual([]);
  });

  it("consumes a persisted capture signature once", () => {
    rehydratedSignatures.current = {
      8: {
        lastCapturedSignature: "captured",
        lastCapturedTurns: 3,
        lastRoutedSignature: "routed",
        updatedAt: 1,
      },
    };

    const state = getOrCreateTabState(8);
    expect(state.lastCapturedSignature).toBe("captured");
    expect(rehydratedSignatures.current[8]).toBeUndefined();
  });

  it("clears transient routing and insertion state on navigation", () => {
    const state = getOrCreateTabState(9);
    state.page = { supported: true, url: "https://chatgpt.com/c/one" };
    state.capturePending = true;
    state.associationSuppressed = true;
    state.routingReview = { confidence: "high", score: 10, reasons: ["x"] };
    state.insertState = {
      status: "inserted",
      source: "sidebar",
      message: "done",
      updatedAt: "now",
    };

    updateTabPageState(9, { supported: true, url: "https://chatgpt.com/c/two" });

    expect(state.capturePending).toBe(false);
    expect(state.associationSuppressed).toBe(false);
    expect(state.routingReview).toBeNull();
    expect(state.insertState.status).toBe("idle");
  });

  it("removes closed tab state", () => {
    getOrCreateTabState(10);
    clearTabState(10);
    expect(tabStates.has(10)).toBe(false);
  });
});
