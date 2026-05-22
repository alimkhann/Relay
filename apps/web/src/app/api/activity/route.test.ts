import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  rejectMcpViewerMock,
  listCachedActivityFeedForUserMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: any) => handler),
  resolveViewerMock: vi.fn(),
  rejectMcpViewerMock: vi.fn(),
  listCachedActivityFeedForUserMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, rejectMcpViewer: rejectMcpViewerMock }))
vi.mock("@/server/cache/read-model-cache", () => ({
  listCachedActivityFeedForUser: listCachedActivityFeedForUserMock,
}))

import { GET } from "./route"

describe("GET /api/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "session" })
  })

  it("reads activity through the server cache without public CDN caching", async () => {
    listCachedActivityFeedForUserMock.mockResolvedValue([{ kind: "capture", projectId: "project-1" }])

    const response = await GET(new Request("http://relay.test/api/activity"))

    expect(rejectMcpViewerMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }))
    expect(listCachedActivityFeedForUserMock).toHaveBeenCalledWith("user-1")
    expect(String(response.headers.get("Cache-Control") ?? "")).not.toMatch(/public/i)
    expect(await response.json()).toEqual({ feed: [{ kind: "capture", projectId: "project-1" }] })
  })
})
