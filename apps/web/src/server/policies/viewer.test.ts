import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createRepositoryBundleMock,
  extensionGetValidByHashMock,
  extensionTouchIfStaleMock,
  mcpGetExpiredButRefreshableByHashMock,
  mcpGetValidAccessTokenByHashMock,
  mcpTouchIfStaleMock,
  reconcileProfileForAuthUserMock,
  logServerEventMock,
} = vi.hoisted(() => ({
  createRepositoryBundleMock: vi.fn(),
  extensionGetValidByHashMock: vi.fn(),
  extensionTouchIfStaleMock: vi.fn(),
  mcpGetExpiredButRefreshableByHashMock: vi.fn(),
  mcpGetValidAccessTokenByHashMock: vi.fn(),
  mcpTouchIfStaleMock: vi.fn(),
  reconcileProfileForAuthUserMock: vi.fn(async () => undefined),
  logServerEventMock: vi.fn(async () => undefined),
}));

vi.mock("@relay/db", () => ({
  createRepositoryBundle: createRepositoryBundleMock,
  // Token resolution (pre-viewer) now uses the service bundle; same mock.
  createServiceRepositoryBundle: createRepositoryBundleMock,
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

import { resolveViewer, syncViewerProfile } from "./viewer";

describe("resolveViewer", () => {
  beforeEach(() => {
    createRepositoryBundleMock.mockReset();
    extensionGetValidByHashMock.mockReset();
    extensionTouchIfStaleMock.mockReset();
    mcpGetExpiredButRefreshableByHashMock.mockReset();
    mcpGetValidAccessTokenByHashMock.mockReset();
    mcpTouchIfStaleMock.mockReset();
    createRepositoryBundleMock.mockReturnValue({
      extensionTokens: {
        getValidByHash: extensionGetValidByHashMock,
        touchIfStale: extensionTouchIfStaleMock,
      },
      mcpTokens: {
        getExpiredButRefreshableByHash: mcpGetExpiredButRefreshableByHashMock,
        getValidAccessTokenByHash: mcpGetValidAccessTokenByHashMock,
        touchIfStale: mcpTouchIfStaleMock,
      },
    });
  });

  it("routes extension-prefixed tokens directly to extension token storage", async () => {
    extensionGetValidByHashMock.mockResolvedValue({
      id: "extension-token-1",
      userId: "user-1",
    });

    await expect(resolveViewer("Bearer relay_extension-token")).resolves.toMatchObject({
      userId: "user-1",
      mode: "extension",
    });

    expect(extensionGetValidByHashMock).toHaveBeenCalledOnce();
    expect(mcpGetValidAccessTokenByHashMock).not.toHaveBeenCalled();
    expect(mcpGetExpiredButRefreshableByHashMock).not.toHaveBeenCalled();
  });

  it("routes MCP-prefixed tokens only to MCP token storage", async () => {
    mcpGetValidAccessTokenByHashMock.mockResolvedValue({
      id: "mcp-token-1",
      userId: "user-1",
      projectId: "project-1",
      scopes: ["project:read"],
    });

    await expect(resolveViewer("Bearer relay_mcp_access-token")).resolves.toMatchObject({
      userId: "user-1",
      mode: "mcp",
    });

    expect(mcpGetValidAccessTokenByHashMock).toHaveBeenCalledOnce();
    expect(extensionGetValidByHashMock).not.toHaveBeenCalled();
  });
});

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
