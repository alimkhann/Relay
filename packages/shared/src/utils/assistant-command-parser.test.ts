import { describe, expect, it } from "vitest"

import {
  commandToMemoryPatch,
  parseAssistantCommand,
} from "./assistant-command-parser"

describe("parseAssistantCommand", () => {
  it.each([
    ["/reaffirm abc12345", { command: "reaffirm", memoryId: "abc12345" }],
    ["/forget 0d8f3c2e-1a4b-4c1f-8a2e-9b3d5f6e7c10", {
      command: "forget",
      memoryId: "0d8f3c2e-1a4b-4c1f-8a2e-9b3d5f6e7c10",
    }],
    ["/obsolete 12345678", { command: "obsolete", memoryId: "12345678" }],
    ["/archive abcdef-1234", { command: "archive", memoryId: "abcdef-1234" }],
    ["/restore deadbeef", { command: "restore", memoryId: "deadbeef" }],
    ["  /reaffirm  abc12345  ", { command: "reaffirm", memoryId: "abc12345" }],
    ["/FORGET ABC12345", { command: "forget", memoryId: "ABC12345" }],
  ])("parses %j", (input, expected) => {
    expect(parseAssistantCommand(input)).toEqual(expected)
  })

  it.each([
    "",
    "/reaffirm",                     // missing id
    "/reaffirm abc",                 // id too short (< 8 chars)
    "/unknown abc12345",             // unknown command
    "/reaffirm abc12345 extra text", // chat continuation, not a pure command
    "tell me about /reaffirm abc12345", // command embedded mid-message
    "// reaffirm abc12345",          // wrong slash
    "reaffirm abc12345",             // no slash
  ])("returns null for %j", (input) => {
    expect(parseAssistantCommand(input)).toBeNull()
  })
})

describe("commandToMemoryPatch", () => {
  const now = new Date("2026-05-26T12:00:00Z")

  it("reaffirm bumps lastReaffirmedAt", () => {
    expect(commandToMemoryPatch({ command: "reaffirm", memoryId: "x" }, now)).toEqual({
      lastReaffirmedAt: "2026-05-26T12:00:00.000Z",
    })
  })

  it("forget forces confirm:true", () => {
    expect(commandToMemoryPatch({ command: "forget", memoryId: "x" }, now)).toEqual({
      lifecycleState: "forgotten",
      confirm: true,
    })
  })

  it("obsolete sets cooling + validUntil=now", () => {
    expect(commandToMemoryPatch({ command: "obsolete", memoryId: "x" }, now)).toEqual({
      lifecycleState: "cooling",
      validUntil: "2026-05-26T12:00:00.000Z",
    })
  })

  it("archive + restore flip lifecycleState only", () => {
    expect(commandToMemoryPatch({ command: "archive", memoryId: "x" }, now)).toEqual({
      lifecycleState: "archived",
    })
    expect(commandToMemoryPatch({ command: "restore", memoryId: "x" }, now)).toEqual({
      lifecycleState: "active",
    })
  })
})
