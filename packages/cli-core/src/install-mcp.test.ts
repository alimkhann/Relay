import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { RELAY_MCP_CLIENTS, getRelayMcpClientDescriptor } from "../../shared/src/index"

import type { DetectedIDE } from "./detect"
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
    mcpConfigPath,
    clientSetupPath,
    legacyConfigPaths: [],
  }
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
    expect(raw).toContain("enabled = true")
    expect(await validateInstalledMcpConfig(ide)).toBe(true)
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
    expect(raw.mcp?.relay?.command?.[0]).toBe("node")
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
    expect(raw.servers?.relay?.command).toBe("node")
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

describe("installClientSetup", () => {
  it("installs and removes Claude Code autosave hooks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-claude-"))
    const settingsPath = join(dir, "settings.json")
    const ide = buildDetectedIDE("claude", join(dir, ".claude.json"), settingsPath)

    const installedPath = await installClientSetup(ide)
    expect(installedPath).toBe(settingsPath)
    expect(await validateInstalledClientSetup(ide)).toBe(true)

    const installed = JSON.parse(await readFile(settingsPath, "utf-8")) as {
      hooks?: Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>
    }
    expect(installed.hooks?.PreCompact?.[0]?.hooks?.[0]?.command).toContain("relay-flush precompact")
    expect(installed.hooks?.StopFailure?.[0]?.hooks?.[0]?.command).toContain("relay-flush stop_failure")

    const removed = await uninstallClientSetup(ide)
    expect(removed).toBe(true)

    const uninstalled = JSON.parse(await readFile(settingsPath, "utf-8")) as { hooks?: Record<string, unknown> }
    expect(uninstalled.hooks).toBeUndefined()
  })

  it("installs and removes Gemini CLI hooks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-gemini-"))
    const settingsPath = join(dir, "settings.json")
    const ide = buildDetectedIDE("gemini-cli", settingsPath, settingsPath)

    await installClientSetup(ide)
    expect(await validateInstalledClientSetup(ide)).toBe(true)

    const installed = JSON.parse(await readFile(settingsPath, "utf-8")) as {
      hooks?: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }
    expect(installed.hooks?.PreCompress?.[0]?.hooks?.[0]?.command).toContain("relay-flush precompress")
    expect(installed.hooks?.AfterAgent?.[0]?.hooks?.[0]?.command).toContain("--failure-only")

    const removed = await uninstallClientSetup(ide)
    expect(removed).toBe(true)

    const uninstalled = JSON.parse(await readFile(settingsPath, "utf-8")) as { hooks?: Record<string, unknown> }
    expect(uninstalled.hooks).toBeUndefined()
  })

  it("installs and removes Windsurf hooks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "relay-windsurf-"))
    const hooksPath = join(dir, "hooks.json")
    const ide = buildDetectedIDE("windsurf", join(dir, "mcp_config.json"), hooksPath)

    await installClientSetup(ide)
    expect(await validateInstalledClientSetup(ide)).toBe(true)

    const installed = JSON.parse(await readFile(hooksPath, "utf-8")) as {
      hooks?: Record<string, Array<{ command: string }>>
    }
    expect(installed.hooks?.post_cascade_response_with_transcript?.[0]?.command).toContain("--failure-only")
    expect(installed.hooks?.post_mcp_tool_use?.[0]?.command).toContain("mcp_tool_use")

    const removed = await uninstallClientSetup(ide)
    expect(removed).toBe(true)

    const uninstalled = JSON.parse(await readFile(hooksPath, "utf-8")) as { hooks?: Record<string, unknown> }
    expect(uninstalled.hooks).toBeUndefined()
  })
})
