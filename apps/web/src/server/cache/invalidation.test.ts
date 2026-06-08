import { beforeEach, describe, expect, it, vi } from "vitest"

const { revalidateTagMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
}))

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}))

import {
  invalidateProjectCache,
  invalidateProjectMemoryCache,
  invalidateProjectSourceCache,
  invalidateUserProjectsCache,
} from "./invalidation"

describe("cache invalidation", () => {
  beforeEach(() => {
    revalidateTagMock.mockReset()
  })

  it("invalidates user, project, dashboard, source, memory, and activity tags for project changes", () => {
    invalidateProjectCache("user-1", "project-1")

    expect(revalidateTagMock).toHaveBeenCalledWith("relay:user:user-1", "max")
    expect(revalidateTagMock).toHaveBeenCalledWith("relay:activity:user-1", "max")
    expect(revalidateTagMock).toHaveBeenCalledWith("relay:project:project-1", "max")
    expect(revalidateTagMock).toHaveBeenCalledWith("relay:dashboard:project-1", "max")
    expect(revalidateTagMock).toHaveBeenCalledWith("relay:sources:project-1", "max")
    expect(revalidateTagMock).toHaveBeenCalledWith("relay:memory:project-1", "max")
  })

  it("invalidates source detail tags when a source id is known", () => {
    invalidateProjectSourceCache("user-1", "project-1", "source-1")

    expect(revalidateTagMock).toHaveBeenCalledWith("relay:source:source-1", "max")
  })

  it("invalidates memory/dashboard/activity without expiring unrelated source caches", () => {
    invalidateProjectMemoryCache("user-1", "project-1")

    expect(revalidateTagMock).toHaveBeenCalledWith("relay:activity:user-1", "max")
    expect(revalidateTagMock).toHaveBeenCalledWith("relay:dashboard:project-1", "max")
    expect(revalidateTagMock).toHaveBeenCalledWith("relay:memory:project-1", "max")
    expect(revalidateTagMock).not.toHaveBeenCalledWith("relay:user:user-1", "max")
    expect(revalidateTagMock).not.toHaveBeenCalledWith("relay:project:project-1", "max")
    expect(revalidateTagMock).not.toHaveBeenCalledWith("relay:sources:project-1", "max")
  })

  it("invalidates project list and activity tags for user project list changes", () => {
    invalidateUserProjectsCache("user-1")

    expect(revalidateTagMock).toHaveBeenCalledWith("relay:user:user-1", "max")
    expect(revalidateTagMock).toHaveBeenCalledWith("relay:user:user-1:projects", "max")
    expect(revalidateTagMock).toHaveBeenCalledWith("relay:activity:user-1", "max")
  })
})
