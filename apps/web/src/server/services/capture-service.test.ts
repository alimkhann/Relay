import { beforeEach, describe, expect, it, vi } from "vitest"

// Mocked repository + digest surface. capture-service calls
// createRepositoryBundle() and the digest-service helpers; we stub both so the
// tests assert the multi-project FAN-OUT and PERSONAL-PRECEDENCE logic without a
// database or Gemini.
const linkToProjectsMock = vi.fn(async () => {})
const listLinkedProjectIdsMock = vi.fn(async () => [] as string[])
const getByIdMock = vi.fn()
const filterMemberProjectIdsMock = vi.fn(async (ids: string[]) => ids)
const isMemberMock = vi.fn(async () => true)
const getPersonalProjectMock = vi.fn(async () => null as { id: string } | null)
const listBySessionMock = vi.fn(async () => [] as Array<{ role: string; content: string }>)
const enqueueDigestJobMock = vi.fn(async () => ({ id: "job" }))
const decideDigestStrategyMock = vi.fn(async () => ({ strategy: "deferred" as const, budgetStatus: null }))
const scheduleDrainMock = vi.fn(() => {})
const routePersonalMemoryMock = vi.fn(async () => ({ written: 0, unsure: 0, duplicate: 0, personalProjectId: null }))

vi.mock("@relay/db", () => ({
  createRepositoryBundle: () => ({
    sessions: {
      linkToProjects: linkToProjectsMock,
      listLinkedProjectIds: listLinkedProjectIdsMock,
      getById: getByIdMock,
    },
    members: {
      filterMemberProjectIds: filterMemberProjectIdsMock,
      isMember: isMemberMock,
    },
    projects: { getPersonalProject: getPersonalProjectMock },
    turns: { listBySession: listBySessionMock },
  }),
}))

vi.mock("./digest-service", () => ({
  decideDigestStrategy: (...a: unknown[]) => decideDigestStrategyMock(...(a as [])),
  enqueueDigestJob: (...a: unknown[]) => enqueueDigestJobMock(...(a as [])),
  scheduleDigestDrainForProject: (...a: unknown[]) => scheduleDrainMock(...(a as [])),
}))

vi.mock("@/server/cache/invalidation", () => ({
  invalidateProjectCache: () => {},
}))

vi.mock("./personal-memory-service", () => ({
  routePersonalMemory: (...a: unknown[]) => routePersonalMemoryMock(...(a as [])),
}))

import { linkSessionToProjects } from "./capture-service"

const ORIGIN = "11111111-1111-1111-1111-111111111111"
const PROJECT_B = "22222222-2222-2222-2222-222222222222"
const PERSONAL = "33333333-3333-3333-3333-333333333333"
const SESSION = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

function fakeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION,
    projectId: ORIGIN,
    captureSignature: "sig-1",
    platform: "claude",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getByIdMock.mockResolvedValue(fakeSession())
  filterMemberProjectIdsMock.mockImplementation(async (ids: string[]) => ids)
  isMemberMock.mockResolvedValue(true)
  listLinkedProjectIdsMock.mockResolvedValue([ORIGIN])
  getPersonalProjectMock.mockResolvedValue(null)
  decideDigestStrategyMock.mockResolvedValue({ strategy: "deferred", budgetStatus: null })
})

// NOTE: do not vi.resetAllMocks() here — it strips mock implementations that
// other service tests' vi.mock factories rely on when the suite runs together.
// clearAllMocks (beforeEach) already resets call state between tests.

describe("linkSessionToProjects", () => {
  it("links a non-personal project and enqueues its digest", async () => {
    const result = await linkSessionToProjects("user", SESSION, [PROJECT_B])

    expect(result.linked).toEqual([PROJECT_B])
    expect(linkToProjectsMock).toHaveBeenCalledWith(SESSION, [PROJECT_B], "user")
    expect(enqueueDigestJobMock).toHaveBeenCalledTimes(1)
    expect(enqueueDigestJobMock).toHaveBeenCalledWith(
      "user",
      expect.objectContaining({ projectId: PROJECT_B, sessionId: SESSION, status: "deferred" }),
    )
    // No personal project resolved → no personal harvest.
    expect(routePersonalMemoryMock).not.toHaveBeenCalled()
  })

  it("links Personal WITHOUT a project digest, harvesting durable facts instead", async () => {
    getPersonalProjectMock.mockResolvedValue({ id: PERSONAL })
    listBySessionMock.mockResolvedValue([{ role: "user", content: "I prefer dark mode" }])

    const result = await linkSessionToProjects("user", SESSION, [PERSONAL])

    expect(result.linked).toEqual([PERSONAL])
    expect(linkToProjectsMock).toHaveBeenCalledWith(SESSION, [PERSONAL], "user")
    // CRITICAL: Personal must NOT get a project session_digest...
    expect(enqueueDigestJobMock).not.toHaveBeenCalled()
    // ...it gets durable user facts via the salience router instead.
    expect(routePersonalMemoryMock).toHaveBeenCalledTimes(1)
    expect(routePersonalMemoryMock).toHaveBeenCalledWith(
      "user",
      ORIGIN,
      expect.stringContaining("dark mode"),
      expect.any(Object),
    )
  })

  it("digests a non-personal project but skips digest for Personal when both targeted", async () => {
    getPersonalProjectMock.mockResolvedValue({ id: PERSONAL })
    listBySessionMock.mockResolvedValue([{ role: "user", content: "I live in Almaty" }])

    await linkSessionToProjects("user", SESSION, [PROJECT_B, PERSONAL])

    // Only the non-personal project is digested.
    expect(enqueueDigestJobMock).toHaveBeenCalledTimes(1)
    expect(enqueueDigestJobMock).toHaveBeenCalledWith(
      "user",
      expect.objectContaining({ projectId: PROJECT_B }),
    )
    expect(routePersonalMemoryMock).toHaveBeenCalledTimes(1)
  })

  it("is idempotent — already-linked projects are not re-linked or re-digested", async () => {
    listLinkedProjectIdsMock.mockResolvedValue([ORIGIN, PROJECT_B])

    const result = await linkSessionToProjects("user", SESSION, [PROJECT_B])

    expect(result.linked).toEqual([])
    expect(linkToProjectsMock).not.toHaveBeenCalled()
    expect(enqueueDigestJobMock).not.toHaveBeenCalled()
  })

  it("drops non-member targets and reports them as skipped", async () => {
    filterMemberProjectIdsMock.mockResolvedValue([]) // not a member of PROJECT_B

    const result = await linkSessionToProjects("user", SESSION, [PROJECT_B])

    expect(result.linked).toEqual([])
    expect(result.skipped).toEqual([PROJECT_B])
    expect(linkToProjectsMock).not.toHaveBeenCalled()
  })

  it("rejects when the caller is not a member of the session's origin project", async () => {
    isMemberMock.mockResolvedValue(false)
    await expect(linkSessionToProjects("user", SESSION, [PROJECT_B])).rejects.toThrow(
      /not authorized/i,
    )
  })

  it("ignores the origin project passed as an extra target", async () => {
    const result = await linkSessionToProjects("user", SESSION, [ORIGIN])
    expect(result.linked).toEqual([])
    expect(linkToProjectsMock).not.toHaveBeenCalled()
  })
})
