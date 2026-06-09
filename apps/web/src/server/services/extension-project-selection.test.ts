import { describe, expect, it } from "vitest"

import { resolveExtensionSelectedProjectId } from "./extension-project-selection"

describe("resolveExtensionSelectedProjectId", () => {
  const projects = [
    { id: "personal-1", kind: "personal" as const },
    { id: "proj-1", kind: "project" as const },
    { id: "proj-2", kind: "project" as const },
  ]

  it("returns empty when onboarding is incomplete", () => {
    expect(
      resolveExtensionSelectedProjectId(projects, { status: "pending", completedProjectId: "proj-1" }),
    ).toBe("")
  })

  it("skips a completed personal project id", () => {
    expect(
      resolveExtensionSelectedProjectId(projects, { status: "completed", completedProjectId: "personal-1" }),
    ).toBe("proj-1")
  })

  it("reuses a completed non-personal project id", () => {
    expect(
      resolveExtensionSelectedProjectId(projects, { status: "completed", completedProjectId: "proj-2" }),
    ).toBe("proj-2")
  })

  it("falls back to the first selectable project", () => {
    expect(
      resolveExtensionSelectedProjectId(
        [{ id: "personal-1", kind: "personal" }],
        { status: "completed", completedProjectId: null },
      ),
    ).toBe("")
  })
})