import { describe, expect, it } from "vitest"

import { getStringFlag, hasFlag, parseArgs } from "./args"

describe("parseArgs", () => {
  it("parses commands, subcommands, flags, and positionals", () => {
    const parsed = parseArgs(["brief", "proj-1", "--profile", "claude_code_build", "--kind=quick_continuity", "-h"])

    expect(parsed.command).toBe("brief")
    expect(parsed.subcommand).toBe("proj-1")
    expect(parsed.positionals).toEqual([])
    expect(getStringFlag(parsed.flags, "profile")).toBe("claude_code_build")
    expect(getStringFlag(parsed.flags, "kind")).toBe("quick_continuity")
    expect(hasFlag(parsed.flags, "h")).toBe(true)
  })

  it("collects additional positionals after subcommand", () => {
    const parsed = parseArgs(["projects", "switch", "my-project", "--project", "override"])

    expect(parsed.command).toBe("projects")
    expect(parsed.subcommand).toBe("switch")
    expect(parsed.positionals).toEqual(["my-project"])
    expect(getStringFlag(parsed.flags, "project")).toBe("override")
  })
})
