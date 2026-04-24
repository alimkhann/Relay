import { describe, expect, it } from "vitest"

import { fromProjectInput, toProjectRow } from "./project-mapper"

describe("project mapper", () => {
  it("maps project_url between database records and project rows", () => {
    expect(toProjectRow({
      id: "project-1",
      owner_id: "user-1",
      name: "Relay",
      slug: "relay",
      description: "AI context sync.",
      project_url: "https://www.onrelay.app",
      is_archived: false,
      created_at: "2026-04-24T00:00:00.000Z",
      updated_at: "2026-04-24T00:00:00.000Z",
    }).projectUrl).toBe("https://www.onrelay.app")

    expect(fromProjectInput({
      ownerId: "user-1",
      name: "Relay",
      slug: "relay",
      projectUrl: "https://www.onrelay.app",
    })).toMatchObject({
      project_url: "https://www.onrelay.app",
    })
  })
})
