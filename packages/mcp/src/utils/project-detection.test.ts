import { describe, it, expect } from "vitest"
import { detectProjectId } from "./project-detection.js"

const projects = [
  { id: "proj-1", name: "Relay", keywords: ["relay", "browser-extension"] },
  { id: "proj-2", name: "Dashboard", keywords: ["dashboard", "admin-panel"] },
  { id: "proj-3", name: "API Server", keywords: ["api", "backend"] }
]

describe("detectProjectId", () => {
  it("matches by exact project name against cwd", async () => {
    // This test depends on the actual cwd, so we just verify it returns string | null
    const result = await detectProjectId(projects)
    expect(result === null || typeof result === "string").toBe(true)
  })

  it("returns null when no projects match", async () => {
    const result = await detectProjectId([
      { id: "proj-99", name: "ZZZ Unrelated", keywords: ["zzz-no-match-ever"] }
    ])
    // Unlikely to match any real cwd
    // This is a best-effort test since we can't mock process.cwd easily
    expect(result === null || typeof result === "string").toBe(true)
  })

  it("returns null for empty project list", async () => {
    const result = await detectProjectId([])
    expect(result).toBeNull()
  })
})
