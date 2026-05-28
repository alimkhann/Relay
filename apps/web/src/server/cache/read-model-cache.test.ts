import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  cacheDefinitions,
  listActivityFeedForUserMock,
  listMemoryForExplainabilityMock,
  getProjectDashboardForUserMock,
  listProjectsForUserMock,
  getProjectSourceDetailMock,
  listProjectSourcesMock,
} = vi.hoisted(() => ({
  cacheDefinitions: [] as Array<{ keyParts: string[]; options: { revalidate: number; tags: string[] } }>,
  listActivityFeedForUserMock: vi.fn(),
  listMemoryForExplainabilityMock: vi.fn(),
  getProjectDashboardForUserMock: vi.fn(),
  listProjectsForUserMock: vi.fn(),
  getProjectSourceDetailMock: vi.fn(),
  listProjectSourcesMock: vi.fn(),
}))

vi.mock("next/cache", () => ({
  unstable_cache: (
    reader: () => Promise<unknown>,
    keyParts: string[],
    options: { revalidate: number; tags: string[] },
  ) => {
    cacheDefinitions.push({ keyParts, options })
    return reader
  },
}))

vi.mock("@/server/services/activity-service", () => ({
  listActivityFeedForUser: listActivityFeedForUserMock,
}))

vi.mock("@/server/services/continuity-explainability-service", () => ({
  listMemoryForExplainability: listMemoryForExplainabilityMock,
}))

vi.mock("@/server/services/project-service", () => ({
  getProjectDashboardForUser: getProjectDashboardForUserMock,
  listProjectsForUser: listProjectsForUserMock,
}))

vi.mock("@/server/services/source-service", () => ({
  getProjectSourceDetail: getProjectSourceDetailMock,
  listProjectSources: listProjectSourcesMock,
}))

import {
  getCachedProjectDashboardForUser,
  getCachedProjectSourceDetail,
  listCachedActivityFeedForUser,
  listCachedMemoryForExplainability,
  listCachedProjectSources,
  listCachedProjectsForUser,
} from "./read-model-cache"

describe("read-model-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cacheDefinitions.length = 0
  })

  it("scopes project list cache by user", async () => {
    listProjectsForUserMock.mockResolvedValue([{ id: "project-1" }])

    await expect(listCachedProjectsForUser("user-1")).resolves.toEqual([{ id: "project-1" }])

    expect(cacheDefinitions[0]).toMatchObject({
      keyParts: ["v2", "projects", "user-1", "no-personal"],
      options: {
        revalidate: 300,
        tags: ["v2", "relay:user:user-1", "relay:user:user-1:projects"],
      },
    })
    expect(listProjectsForUserMock).toHaveBeenCalledWith("user-1", { includePersonal: false })
  })

  it("scopes project dashboard cache by user and project", async () => {
    getProjectDashboardForUserMock.mockResolvedValue({ project: { id: "project-1" } })

    await getCachedProjectDashboardForUser("user-1", "project-1")

    expect(cacheDefinitions[0]?.options.tags).toEqual([
      "v2",
      "relay:user:user-1",
      "relay:project:project-1",
      "relay:dashboard:project-1",
    ])
    expect(getProjectDashboardForUserMock).toHaveBeenCalledWith("user-1", "project-1")
  })

  it("scopes source list and detail caches by project and source", async () => {
    listProjectSourcesMock.mockResolvedValue([{ id: "source-1" }])
    getProjectSourceDetailMock.mockResolvedValue({ source: { id: "source-1" } })

    await listCachedProjectSources("user-1", "project-1")
    await getCachedProjectSourceDetail("user-1", "project-1", "source-1", { chunkId: "chunk-1", limit: 10 })

    expect(cacheDefinitions[0]?.options.tags).toContain("relay:sources:project-1")
    expect(cacheDefinitions[1]?.options.tags).toContain("relay:source:source-1")
    expect(cacheDefinitions[1]?.keyParts).toEqual([
      "v2",
      "project-source-detail",
      "user-1",
      "project-1",
      "source-1",
      "chunk-1",
      "10",
    ])
    expect(getProjectSourceDetailMock).toHaveBeenCalledWith("user-1", "project-1", "source-1", {
      chunkId: "chunk-1",
      limit: 10,
    })
  })

  it("scopes memory and activity caches", async () => {
    listMemoryForExplainabilityMock.mockResolvedValue([{ id: "memory-1" }])
    listActivityFeedForUserMock.mockResolvedValue([{ id: "activity-1" }])

    await listCachedMemoryForExplainability("user-1", "project-1", { limit: 20, sort: "updated_desc" })
    await listCachedActivityFeedForUser("user-1")

    expect(cacheDefinitions[0]?.options.tags).toContain("relay:memory:project-1")
    expect(cacheDefinitions[1]?.options.tags).toContain("relay:activity:user-1")
    expect(listMemoryForExplainabilityMock).toHaveBeenCalledWith("user-1", "project-1", {
      limit: 20,
      sort: "updated_desc",
    })
  })
})
