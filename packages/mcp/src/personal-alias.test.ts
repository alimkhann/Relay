import { describe, expect, it, vi } from "vitest"

import { resolvePersonalProjectId } from "./tools/resolve-personal.js"

const PERSONAL_ID = "33333333-3333-3333-3333-333333333333"

describe('MCP "personal" projectId alias', () => {
  it("fetches the personal-inclusive list and returns the kind=personal id", async () => {
    const get = vi.fn(async (path: string) => {
      expect(path).toBe("/api/projects?includePersonal=true")
      return {
        projects: [
          { id: "p1", name: "Relay", kind: "project" },
          { id: PERSONAL_ID, name: "Personal", kind: "personal" },
        ],
      }
    })

    const id = await resolvePersonalProjectId({ get } as never)
    expect(id).toBe(PERSONAL_ID)
    // Critical regression guard: the bare /api/projects excludes personal, so
    // the alias MUST request includePersonal=true (it threw before this fix).
    expect(get).toHaveBeenCalledWith("/api/projects?includePersonal=true")
  })

  it("throws a clear error when the account has no personal project", async () => {
    const get = vi.fn(async () => ({ projects: [{ id: "p1", name: "Relay", kind: "project" }] }))
    await expect(resolvePersonalProjectId({ get } as never)).rejects.toThrow(
      /no personal project/i,
    )
  })
})
