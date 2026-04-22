import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { RELAY_MCP_CLIENTS, getRelayMcpClientDescriptor } from "../../shared/src/index"

import type { DetectedIDE } from "./detect"
import { getMcpCommand } from "./detect"
import { installMcpConfig, uninstallMcpConfig, validateInstalledMcpConfig } from "./install-mcp"
import {
  installClientSetup,
  uninstallClientSetup,
  validateInstalledClientSetup,
} from "./install-client-setup"

function buildDetectedIDE(id: DetectedIDE["id"], mcpConfigPath: string, clientSetupPath: string | null = null): DetectedIDE {
  const descriptor = getRelayMcpClientDescriptor(id)
  if (!descriptor) {
    throw new Error(`Missing descriptor for ${id}`)
  }

  return {
    ...descriptor,
    workspaceRoot: dirnameOf(mcpConfigPath),
    mcpConfigPath,
    clientSetupPath,
    legacyConfigPaths: [],
  }
}

function dirnameOf(path: string) {
  const slash = path.lastIndexOf("/")
  return slash >= 0 ? path.slice(0, slash) : "."
}

describe("RELAY_MCP_CLIENTS", () => {
  it("publishes audited compatibility metadata for every client", () => {
    expect(RELAY_MCP_CLIENTS).toHaveLength(11)
    for (const client of RELAY_MCP_CLIENTS) {
      expect(client.mcpConfig.length).toBeGreaterThan(0)
      expect(client.officialDocsUrl.startsWith("https://")).toBe(true)
      expect(client.lastVerifiedAt).toBe("2026-04-19")
      expect(["validated", "supported", "experimental"]).toContain(client.supportTier)
    }
  })
})

describe("installMcpConfig", () => {
  it("writes Codex MCP config into config.toml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-codex-"))
    const configPath = join(dir, "config.toml")
    const ide = buildDetectedIDE("codex-cli", configPath)

    await installMcpConfig(ide, { mode: "local" })

    const raw = await readFile(configPath, "utf-8")
    expect(raw).toContain('[mcp_servers."relay"]')
    expect(raw).toContain('command = "npx"')
    expect(raw).toContain('args = ["-y", "-p", "@onrelay/mcp", "relay-mcp"]')
    expect(raw).toContain("enabled = true")
    expect(await validateInstalledMcpConfig(ide)).toBe(true)
  })

  it("repairs leaked Relay keys inside a Codex http_headers table", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-codex-leak-"))
    const configPath = join(dir, "config.toml")
    const ide = buildDetectedIDE("codex-cli", configPath)

    await writeFile(
      configPath,
      [
        '[mcp_servers."Neon"]',
        'type = "http"',
        'url = "https://mcp.neon.tech/mcp"',
        "",
        '[mcp_servers."Neon".http_headers]',
        'Authorization = "Bearer neon-token"',
        'command = "npx"',
        'args = ["-y", "@onrelay/mcp"]',
        "enabled = true",
        "",
      ].join("\n"),
      "utf-8"
    )

    await installMcpConfig(ide, { mode: "local" })

    const raw = await readFile(configPath, "utf-8")
    expect(raw).toContain('[mcp_servers."Neon".http_headers]')
    expect(raw).toContain('Authorization = "Bearer neon-token"')
    expect(raw).not.toContain('args = ["-y", "@onrelay/mcp"]')
    expect(raw).toContain('args = ["-y", "-p", "@onrelay/mcp", "relay-mcp"]')
    expect(raw).toContain('[mcp_servers."relay"]')
  })

  it("writes OpenCode config into the native mcp shape", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-opencode-"))
    const configPath = join(dir, "opencode.json")
    const ide = buildDetectedIDE("opencode", configPath)

    await installMcpConfig(ide, { mode: "local" })

    const raw = JSON.parse(await readFile(configPath, "utf-8")) as {
      mcp?: Record<string, { type: string; command?: string[]; enabled?: boolean }>
    }
    expect(raw.mcp?.relay?.type).toBe("local")
    expect(raw.mcp?.relay?.command).toEqual(["npx", "-y", "-p", "@onrelay/mcp", "relay-mcp"])
    expect(raw.mcp?.relay?.enabled).toBe(true)
  })

  it("writes VS Code config into the servers key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-vscode-"))
    const configPath = join(dir, "mcp.json")
    const ide = buildDetectedIDE("vscode", configPath)

    await installMcpConfig(ide, { mode: "local" })

    const raw = JSON.parse(await readFile(configPath, "utf-8")) as {
      servers?: Record<string, { type?: string; command?: string }>
    }
    expect(raw.servers?.relay?.type).toBe("stdio")
    expect(raw.servers?.relay?.command).toBe("npx")
  })

  it("preserves existing JSONC comments when writing JSON MCP config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-jsonc-"))
    const configPath = join(dir, "mcp.json")
    const ide = buildDetectedIDE("cursor-global", configPath)

    await writeFile(
      configPath,
      `{
  // Keep this comment
  "mcpServers": {
    "neon": {
      "command": "npx"
    }
  }
}
`,
      "utf-8"
    )

    await installMcpConfig(ide, { mode: "local" })

    const raw = await readFile(configPath, "utf-8")
    expect(raw).toContain("// Keep this comment")
    expect(raw).toContain('"neon"')
    expect(raw).toContain('"relay"')
  })

  it("removes Relay from legacy config paths during uninstall", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-cursor-"))
    const configPath = join(dir, "mcp.json")
    const legacyPath = join(dir, "legacy-mcp.json")
    const ide = {
      ...buildDetectedIDE("cursor-global", configPath),
      legacyConfigPaths: [legacyPath],
    }

    await writeFile(configPath, JSON.stringify({ mcpServers: { relay: { command: "node" } } }, null, 2))
    await writeFile(legacyPath, JSON.stringify({ mcpServers: { relay: { command: "node" } } }, null, 2))

    const removed = await uninstallMcpConfig(ide)
    expect(removed).toBe(true)
    expect(await readFile(configPath, "utf-8")).not.toContain('"relay"')
    expect(await readFile(legacyPath, "utf-8")).not.toContain('"relay"')
  })
})

describe("getMcpCommand", () => {
  it("defaults to the published relay-mcp executable even inside the Relay repo", () => {
    const previous = process.env.RELAY_LOCAL_MCP_DEV
    delete process.env.RELAY_LOCAL_MCP_DEV

    try {
      expect(getMcpCommand()).toEqual({
        command: "npx",
        args: ["-y", "-p", "@onrelay/mcp", "relay-mcp"],
      })
    } finally {
      if (previous === undefined) {
        delete process.env.RELAY_LOCAL_MCP_DEV
      } else {
        process.env.RELAY_LOCAL_MCP_DEV = previous
      }
    }
  })

  it("uses the local workspace dist build only when explicitly opted in", () => {
    const previous = process.env.RELAY_LOCAL_MCP_DEV
    process.env.RELAY_LOCAL_MCP_DEV = "1"

    try {
      const command = getMcpCommand()
      expect(command.command).toBe("node")
      expect(command.args[0]).toContain("packages/mcp/dist/index.js")
    } finally {
      if (previous === undefined) {
        delete process.env.RELAY_LOCAL_MCP_DEV
      } else {
        process.env.RELAY_LOCAL_MCP_DEV = previous
      }
    }
  })
})

describe("installClientSetup", () => {
  it("installs and removes Claude Code autosave hooks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-claude-"))
    const settingsPath = join(dir, "settings.json")
    const ide = buildDetectedIDE("claude", join(dir, ".claude.json"), settingsPath)

    const result = await installClientSetup(ide)
    expect(result.artifacts.map((artifact) => artifact.path)).toContain(settingsPath)
    expect(result.artifacts.some((artifact) => artifact.kind === "instructions")).toBe(true)
    expect(await validateInstalledClientSetup(ide)).toBe(true)

    const installed = JSON.parse(await readFile(settingsPath, "utf-8")) as {
      hooks?: Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>
    }
    expect(installed.hooks?.PreCompact?.[0]?.hooks?.[0]?.command).toBe("npx -y -p @onrelay/mcp relay-flush precompact --quiet")
    expect(installed.hooks?.StopFailure?.[0]?.hooks?.[0]?.command).toBe("npx -y -p @onrelay/mcp relay-flush stop_failure --quiet")

    const removed = await uninstallClientSetup(ide)
    expect(removed).toBe(true)

    const uninstalled = JSON.parse(await readFile(settingsPath, "utf-8")) as { hooks?: Record<string, unknown> }
    expect(uninstalled.hooks).toBeUndefined()
  })

  it("installs and removes Gemini CLI hooks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-gemini-"))
    const settingsPath = join(dir, "settings.json")
    const ide = buildDetectedIDE("gemini-cli", settingsPath, settingsPath)

    const result = await installClientSetup(ide)
    expect(result.artifacts.some((artifact) => artifact.kind === "instructions")).toBe(true)
    expect(await validateInstalledClientSetup(ide)).toBe(true)

    const installed = JSON.parse(await readFile(settingsPath, "utf-8")) as {
      hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }
    expect(installed.hooks?.PreCompress?.[0]?.hooks?.[0]?.command).toBe("npx -y -p @onrelay/mcp relay-flush precompress --quiet")
    expect(installed.hooks?.AfterAgent?.[0]?.hooks?.[0]?.command).toContain("--failure-only")

    const removed = await uninstallClientSetup(ide)
    expect(removed).toBe(true)

    const uninstalled = JSON.parse(await readFile(settingsPath, "utf-8")) as { hooks?: Record<string, unknown> }
    expect(uninstalled.hooks).toBeUndefined()
  })

  it("installs Windsurf rules and removes stale Relay hooks", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "relay-windsurf-workspace-"))
    const dir = await mkdtemp(join(tmpdir(), "relay-windsurf-"))
    const hooksPath = join(dir, "hooks.json")
    const ide = {
      ...buildDetectedIDE("windsurf", join(dir, "mcp_config.json"), hooksPath),
      workspaceRoot: workspaceDir,
    }

    await writeFile(
      hooksPath,
      JSON.stringify(
        {
          hooks: {
            post_mcp_tool_use: [{ command: "relay-flush mcp_tool_use --quiet" }],
            post_cascade_response_with_transcript: [{ command: "relay-flush failure --quiet --failure-only" }],
          },
        },
        null,
        2,
      ),
    )

    const result = await installClientSetup(ide)
    expect(result.artifacts.some((artifact) => artifact.kind === "rules")).toBe(true)
    expect(await validateInstalledClientSetup(ide)).toBe(true)

    const installed = JSON.parse(await readFile(hooksPath, "utf-8")) as {
      hooks?: Record<string, Array<{ command: string }>>
    }
    expect(installed.hooks?.post_cascade_response_with_transcript).toBeUndefined()
    expect(installed.hooks?.post_mcp_tool_use).toBeUndefined()

    const removed = await uninstallClientSetup(ide)
    expect(removed).toBe(true)

    const uninstalled = JSON.parse(await readFile(hooksPath, "utf-8")) as { hooks?: Record<string, unknown> }
    expect(uninstalled.hooks).toBeUndefined()
  })

  it("installs a managed Codex instructions block", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "relay-codex-home-"))
    const configPath = join(homeDir, "config.toml")
    const ide = {
      ...buildDetectedIDE("codex-cli", configPath),
      workspaceRoot: join(homeDir, "workspace"),
    }

    await installClientSetup(ide)
    expect(await validateInstalledClientSetup(ide)).toBe(true)

    const instructions = await readFile(join(homeDir, "AGENTS.md"), "utf-8")
    expect(instructions).toContain("BEGIN RELAY MANAGED BLOCK: codex")
    expect(instructions).toContain("Start or resume with `get_brief`")
  })

  it("installs a Cursor rule file", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "relay-cursor-workspace-"))
    const ide = {
      ...buildDetectedIDE("cursor-project", join(workspaceDir, ".cursor", "mcp.json")),
      workspaceRoot: workspaceDir,
    }

    const result = await installClientSetup(ide)
    expect(result.artifacts.some((artifact) => artifact.kind === "rules")).toBe(true)
    expect(await validateInstalledClientSetup(ide)).toBe(true)
    expect(await readFile(join(workspaceDir, ".cursor", "rules", "relay.mdc"), "utf-8")).toContain("Relay-managed Cursor guidance")
  })

  it("installs a Copilot instructions block", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "relay-vscode-workspace-"))
    const ide = {
      ...buildDetectedIDE("vscode", join(workspaceDir, ".vscode", "mcp.json")),
      workspaceRoot: workspaceDir,
    }

    await installClientSetup(ide)
    expect(await validateInstalledClientSetup(ide)).toBe(true)
    expect(await readFile(join(workspaceDir, ".github", "copilot-instructions.md"), "utf-8")).toContain("BEGIN RELAY MANAGED BLOCK: copilot")
  })

  it("installs OpenCode instructions and a project skill", async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), "relay-opencode-workspace-"))
    const configPath = join(workspaceDir, "opencode.json")
    const ide = {
      ...buildDetectedIDE("opencode", configPath),
      workspaceRoot: workspaceDir,
    }

    await installClientSetup(ide)
    expect(await validateInstalledClientSetup(ide)).toBe(true)

    const config = JSON.parse(await readFile(configPath, "utf-8")) as { instructions?: string[] }
    expect(config.instructions).toContain(".agents/instructions/relay.md")
    expect(await readFile(join(workspaceDir, ".agents", "skills", "relay-context", "SKILL.md"), "utf-8")).toContain("name: relay-context")
  })
})
