import { beforeEach, describe, expect, it, vi } from "vitest";

const { reconcileProfileForAuthUserMock, logServerEventMock } = vi.hoisted(() => ({
  reconcileProfileForAuthUserMock: vi.fn(async () => undefined),
  logServerEventMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuthServer: vi.fn(),
}));

vi.mock("@/server/services/auth-sync-service", () => ({
  reconcileProfileForAuthUser: reconcileProfileForAuthUserMock,
}));

vi.mock("@/server/logging/logger", () => ({
  logServerEvent: logServerEventMock,
}));

import { syncViewerProfile } from "./viewer";

describe("syncViewerProfile", () => {
  beforeEach(() => {
    reconcileProfileForAuthUserMock.mockReset();
    reconcileProfileForAuthUserMock.mockResolvedValue(undefined);
    logServerEventMock.mockClear();
  });

  it("swallows profile sync failures for session viewers", async () => {
    reconcileProfileForAuthUserMock.mockRejectedValueOnce(new Error("sync failed"));

    await expect(
      syncViewerProfile({
        userId: "user-1",
        mode: "session",
        email: "user@example.com",
        name: "Relay User",
        image: null,
      }),
    ).resolves.toBeUndefined();

    expect(logServerEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "viewer.profile_sync_failed",
        userId: "user-1",
      }),
    );
  });
});
