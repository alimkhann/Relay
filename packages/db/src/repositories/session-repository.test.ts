import { describe, expect, it, vi } from "vitest"

import type { DatabaseProvider } from "../store/provider"
import { SessionRepository } from "./session-repository"

function createProvider(
  rows: Array<Record<string, unknown>> = [],
  options: {
    callsOverride?: Array<{ text: string; params: unknown[] }>
    memberProjectIds?: string[]
  } = {},
): {
  provider: DatabaseProvider
  calls: Array<{ text: string; params: unknown[] }>
} {
  const calls = options.callsOverride ?? []
  const query: DatabaseProvider["query"] = async (text, params) => {
    calls.push({ text, params: (params as unknown[]) ?? [] })
    if (text.includes("project_members") && options.memberProjectIds) {
      return options.memberProjectIds.map((project_id) => ({ project_id })) as never[]
    }
    return rows as never[]
  }
  return {
    calls,
    provider: {
      mode: "local",
      query: vi.fn(query) as DatabaseProvider["query"],
      transaction: async (cb) => cb(createProvider(rows).provider),
    },
  }
}

describe("SessionRepository multi-project reads", () => {
  it("listByProject surfaces origin OR linked sessions", async () => {
    const { provider, calls } = createProvider()
    await new SessionRepository(provider).listByProject("project_a")

    const sql = calls[0]?.text ?? ""
    expect(sql).toContain("s.project_id = $1")
    expect(sql).toContain("session_projects sp")
    expect(sql).toContain("sp.session_id = s.id and sp.project_id = $1")
    expect(calls[0]?.params[0]).toBe("project_a")
  })

  it("countDistinctConversations counts origin OR linked sessions", async () => {
    const { provider, calls } = createProvider([{ count: 0 }])
    await new SessionRepository(provider).countDistinctConversations("project_a")

    const sql = calls[0]?.text ?? ""
    expect(sql).toContain("session_projects sp")
    expect(sql).toContain("s.project_id = $1")
  })

  it("getGroupedSessions scopes its CTE to origin OR linked sessions", async () => {
    const { provider, calls } = createProvider()
    await new SessionRepository(provider).getGroupedSessions("project_a")

    const sql = calls[0]?.text ?? ""
    expect(sql).toContain("project_sessions")
    expect(sql).toContain("session_projects sp")
  })
})

describe("SessionRepository link methods", () => {
  it("linkToProjects filters to member projects when userId is provided", async () => {
    const calls: Array<{ text: string; params: unknown[] }> = []
    const provider = createProvider([], { callsOverride: calls, memberProjectIds: ["p1"] }).provider
    const repo = new SessionRepository(provider)

    await repo.linkToProjects("session_1", ["p1", "p2"], "user-1")

    expect(calls.some((call) => call.text.includes("project_members"))).toBe(true)
    const insert = calls.find((call) => call.text.includes("session_projects"))
    expect(insert?.params).toEqual(["session_1", ["p1"]])
  })

  it("linkToProjects inserts deduped links and is a no-op for empty input", async () => {
    const { provider, calls } = createProvider()
    const repo = new SessionRepository(provider)

    await repo.linkToProjects("session_1", [])
    expect(calls).toHaveLength(0) // no query for empty input

    await repo.linkToProjects("session_1", ["p1", "p1", "p2"])
    expect(calls).toHaveLength(1)
    expect(calls[0]?.text).toContain("on conflict (session_id, project_id) do nothing")
    // Duplicates collapsed before the query.
    expect(calls[0]?.params).toEqual(["session_1", ["p1", "p2"]])
  })

  it("listLinkedProjectIds returns the project ids", async () => {
    const { provider } = createProvider([{ project_id: "p1" }, { project_id: "p2" }])
    const ids = await new SessionRepository(provider).listLinkedProjectIds("session_1")
    expect(ids).toEqual(["p1", "p2"])
  })

  it("unlinkFromProject deletes a single link", async () => {
    const { provider, calls } = createProvider()
    await new SessionRepository(provider).unlinkFromProject("session_1", "p1")
    expect(calls[0]?.text).toContain("delete from session_projects")
    expect(calls[0]?.params).toEqual(["session_1", "p1"])
  })
})
