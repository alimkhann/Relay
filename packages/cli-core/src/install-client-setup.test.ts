import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { getRelayMcpClientDescriptor } from "../../shared/src/index"

import type { DetectedIDE } from "./detect"
import { installClientSetup } from "./install-client-setup"

async function makeWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), "relay-claude-setup-"))
  return dir
}

function buildClaudeIDE(workspaceRoot: string): DetectedIDE {
  const descriptor = getRelayMcpClientDescriptor("claude")
  if (!descriptor) throw new Error("missing claude descriptor")
  return {
    ...descriptor,
    workspaceRoot,
    mcpConfigPath: join(workspaceRoot, ".mcp.json"),
    clientSetupPath: join(workspaceRoot, "settings.json"),
    legacyConfigPaths: [],
  }
}

describe("installClientSetup / Claude Code hook dedup", () => {
  it("drops stale bare relay-flush entries and removes the Stop event", async () => {
    const workspaceRoot = await makeWorkspace()
    const ide = buildClaudeIDE(workspaceRoot)

    const seededSettings = {
      hooks: {
        PreCompact: [
          {
            matcher: "*",
            hooks: [
              { type: "command", command: "npx -y -p @onrelay/mcp relay-flush precompact --quiet" },
              { type: "command", command: "relay-flush precompact --quiet" },
            ],
          },
        ],
        SessionEnd: [
          {
            matcher: "*",
            hooks: [
              { type: "command", command: "relay-flush session_end --quiet" },
            ],
          },
        ],
        Stop: [
          {
            matcher: "*",
            hooks: [
              { type: "command", command: "npx -y -p @onrelay/mcp relay-flush stop --quiet" },
              { type: "command", command: "relay-flush stop --quiet" },
            ],
          },
        ],
        StopFailure: [
          {
            matcher: "*",
            hooks: [
              { type: "command", command: "relay-flush stop_failure --quiet" },
            ],
          },
        ],
      },
    }
    await writeFile(ide.clientSetupPath!, JSON.stringify(seededSettings, null, 2), "utf-8")

    await installClientSetup(ide)

    const raw = await readFile(ide.clientSetupPath!, "utf-8")
    const settings = JSON.parse(raw) as {
      hooks?: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>
    }
    const hooks = settings.hooks ?? {}

    const flatten = (event: string) =>
      (hooks[event] ?? []).flatMap((group) => group.hooks.map((hook) => hook.command))

    expect(flatten("PreCompact")).toEqual(["npx -y -p @onrelay/mcp relay-flush precompact --quiet"])
    expect(flatten("SessionEnd")).toEqual(["npx -y -p @onrelay/mcp relay-flush session_end --quiet"])
    expect(flatten("StopFailure")).toEqual(["npx -y -p @onrelay/mcp relay-flush stop_failure --quiet"])
    expect(hooks.Stop).toBeUndefined()
  })

  it("is idempotent on rerun with the managed hook set already present", async () => {
    const workspaceRoot = await makeWorkspace()
    const ide = buildClaudeIDE(workspaceRoot)

    await writeFile(ide.clientSetupPath!, JSON.stringify({ hooks: {} }, null, 2), "utf-8")
    await installClientSetup(ide)
    const firstPass = await readFile(ide.clientSetupPath!, "utf-8")
    await installClientSetup(ide)
    const secondPass = await readFile(ide.clientSetupPath!, "utf-8")

    expect(secondPass).toBe(firstPass)

    const settings = JSON.parse(firstPass) as {
      hooks?: Record<string, Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>>
    }
    const eventEntries = Object.values(settings.hooks ?? {}).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
    )
    expect(eventEntries.every((cmd) => cmd.startsWith("npx -y -p @onrelay/mcp relay-flush"))).toBe(true)
    expect(settings.hooks?.Stop).toBeUndefined()
  })
})
