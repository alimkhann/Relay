import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import type { DetectedIDE } from "./detect"
import { getMcpCommand } from "./detect"

interface InstallMcpConfigOptions {
  mode?: "local" | "remote"
  remoteUrl?: string
  bearerToken?: string
}

interface GenericMcpServerConfig {
  type?: "stdio" | "http" | "sse"
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

interface JsonMcpConfig {
  mcpServers?: Record<string, GenericMcpServerConfig>
  servers?: Record<string, GenericMcpServerConfig>
  mcp?: Record<string, unknown>
  [key: string]: unknown
}

interface OpenCodeMcpConfig {
  type: "local" | "remote"
  command?: string[]
  url?: string
  headers?: Record<string, string>
  enabled: boolean
}

function stripJsonComments(raw: string) {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
}

function buildRelayServerConfig(ide: DetectedIDE, options: Required<InstallMcpConfigOptions>): GenericMcpServerConfig {
  if (options.mode === "remote") {
    if (!ide.supportedTransports.includes("remote")) {
      throw new Error(`${ide.name} does not currently support Relay remote HTTP install.`)
    }

    if (!options.remoteUrl || !options.bearerToken) {
      throw new Error("Remote Relay MCP install requires both remoteUrl and bearerToken.")
    }

    const remoteConfig: GenericMcpServerConfig = {
      type: "http",
      url: options.remoteUrl,
      headers: {
        Authorization: `Bearer ${options.bearerToken}`,
      },
    }

    if (ide.id === "cursor-global" || ide.id === "cursor-project") {
      delete remoteConfig.type
    }

    return remoteConfig
  }

  const { command, args } = getMcpCommand()
  const localConfig: GenericMcpServerConfig = {
    type: "stdio",
    command,
    args,
  }

  if (
    ide.configFormat === "json-mcpServers" &&
    ide.id !== "gemini-cli" &&
    ide.id !== "claude-desktop" &&
    ide.id !== "claude"
  ) {
    delete localConfig.type
  }

  return localConfig
}

function tomlString(value: string) {
  return JSON.stringify(value)
}

const CODEX_RELAY_TABLE_HEADER = /^\s*\[mcp_servers(?:\."?relay"?|\.relay)\]\s*$/
const TOML_TABLE_HEADER = /^\s*\[[^\]]+\]\s*$/
const CODEX_HTTP_HEADERS_TABLE_HEADER = /^\s*\[mcp_servers\.(?:"[^"]+"|[A-Za-z0-9_-]+)\.http_headers\]\s*$/
const RELAY_ARGS_SIGNATURE = /@onrelay\/mcp|packages\/mcp\/dist\/index\.js/

function stripCodexRelayTable(raw: string) {
  const lines = raw.split(/\r?\n/)
  const kept: string[] = []
  let inRelayTable = false

  for (const line of lines) {
    if (!inRelayTable && CODEX_RELAY_TABLE_HEADER.test(line)) {
      inRelayTable = true
      continue
    }

    if (inRelayTable && TOML_TABLE_HEADER.test(line)) {
      inRelayTable = false
      kept.push(line)
      continue
    }

    if (!inRelayTable) {
      kept.push(line)
    }
  }

  return kept.join("\n")
}

function isKnownRelayLeakInHeaders(key: string, value: string) {
  const normalizedKey = key.trim()
  const normalizedValue = value.trim()

  if (normalizedKey === "args") {
    return /^\[.*\]$/.test(normalizedValue) && RELAY_ARGS_SIGNATURE.test(normalizedValue)
  }

  if (normalizedKey === "command") {
    return /^"(?:node|npx)"$/.test(normalizedValue)
  }

  if (normalizedKey === "enabled") {
    return /^(?:true|false)$/.test(normalizedValue)
  }

  return false
}

function repairCodexToml(raw: string) {
  const lines = raw.split(/\r?\n/)
  const repaired: string[] = []
  let inHttpHeadersTable = false
  let changed = false

  for (const line of lines) {
    if (TOML_TABLE_HEADER.test(line)) {
      inHttpHeadersTable = CODEX_HTTP_HEADERS_TABLE_HEADER.test(line)
      repaired.push(line)
      continue
    }

    if (!inHttpHeadersTable) {
      repaired.push(line)
      continue
    }

    const kv = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/)
    if (!kv) {
      repaired.push(line)
      continue
    }

    const key = kv[1] ?? ""
    const value = kv[2] ?? ""
    if (isKnownRelayLeakInHeaders(key, value)) {
      changed = true
      continue
    }

    repaired.push(line)
  }

  return changed ? repaired.join("\n") : raw
}

function buildCodexTomlBlock(ide: DetectedIDE, options: Required<InstallMcpConfigOptions>) {
  if (options.mode === "remote") {
    throw new Error("Codex install currently supports Relay local stdio only.")
  }

  const { command, args } = getMcpCommand()
  return [
    `[mcp_servers."relay"]`,
    `command = ${tomlString(command)}`,
    `args = [${args.map((arg) => tomlString(arg)).join(", ")}]`,
    `enabled = true`,
  ].join("\n")
}

function upsertCodexToml(raw: string, block: string) {
  const trimmed = raw.trim()
  const withoutRelay = stripCodexRelayTable(trimmed).trim()
  return `${withoutRelay ? `${withoutRelay}\n\n` : ""}${block}\n`
}

function removeCodexTomlBlock(raw: string) {
  const next = stripCodexRelayTable(raw).trim()
  return next ? `${next}\n` : ""
}

async function loadJsonConfig(path: string): Promise<JsonMcpConfig> {
  try {
    const raw = await readFile(path, "utf-8")
    return JSON.parse(stripJsonComments(raw)) as JsonMcpConfig
  } catch {
    return {}
  }
}

async function loadCodexConfig(path: string) {
  try {
    return await readFile(path, "utf-8")
  } catch {
    return ""
  }
}

function writeJsonMcpServer(
  ide: DetectedIDE,
  existing: JsonMcpConfig,
  relayConfig: GenericMcpServerConfig
) {
  if (ide.configFormat === "json-servers") {
    existing.servers = existing.servers ?? {}
    existing.servers.relay = relayConfig
    return existing
  }

  if (ide.configFormat === "json-opencode") {
    const currentMcp = typeof existing.mcp === "object" && existing.mcp ? existing.mcp as Record<string, unknown> : {}
    const nextRelay: OpenCodeMcpConfig =
      relayConfig.url
        ? {
            type: "remote",
            url: relayConfig.url,
            headers: relayConfig.headers,
            enabled: true,
          }
        : {
            type: "local",
            command: [relayConfig.command ?? "node", ...(relayConfig.args ?? [])],
            enabled: true,
          }

    existing.mcp = {
      ...currentMcp,
      relay: nextRelay,
    }
    return existing
  }

  existing.mcpServers = existing.mcpServers ?? {}
  existing.mcpServers.relay = relayConfig
  return existing
}

function removeRelayFromJsonConfig(ide: DetectedIDE, existing: JsonMcpConfig) {
  let removed = false

  if (existing.mcpServers?.relay) {
    delete existing.mcpServers.relay
    removed = true
    if (Object.keys(existing.mcpServers).length === 0) {
      delete existing.mcpServers
    }
  }

  if (existing.servers?.relay) {
    delete existing.servers.relay
    removed = true
    if (Object.keys(existing.servers).length === 0) {
      delete existing.servers
    }
  }

  if (ide.configFormat === "json-opencode" && existing.mcp && typeof existing.mcp === "object" && "relay" in existing.mcp) {
    const mcp = existing.mcp as Record<string, unknown>
    delete mcp.relay
    removed = true
    if (Object.keys(mcp).length === 0) {
      delete existing.mcp
    }
  }

  return removed
}

export async function installMcpConfig(
  ide: DetectedIDE,
  options: InstallMcpConfigOptions = {}
): Promise<void> {
  const normalized: Required<InstallMcpConfigOptions> = {
    mode: options.mode ?? "local",
    remoteUrl: options.remoteUrl ?? "",
    bearerToken: options.bearerToken ?? "",
  }
  const relayConfig = buildRelayServerConfig(ide, normalized)

  await mkdir(dirname(ide.mcpConfigPath), { recursive: true })

  if (ide.configFormat === "toml-codex") {
    const raw = await loadCodexConfig(ide.mcpConfigPath)
    const repaired = repairCodexToml(raw)
    const next = upsertCodexToml(repaired, buildCodexTomlBlock(ide, normalized))
    await writeFile(ide.mcpConfigPath, next, "utf-8")
    return
  }

  const existing = await loadJsonConfig(ide.mcpConfigPath)
  const next = writeJsonMcpServer(ide, existing, relayConfig)
  await writeFile(ide.mcpConfigPath, JSON.stringify(next, null, 2) + "\n", "utf-8")
}

export async function uninstallMcpConfig(ide: DetectedIDE): Promise<boolean> {
  let removed = false

  const targets = [ide.mcpConfigPath, ...ide.legacyConfigPaths]

  for (const path of targets) {
    if (ide.configFormat === "toml-codex" || path.endsWith(".toml")) {
      const raw = await loadCodexConfig(path)
      const repaired = repairCodexToml(raw)
      const next = removeCodexTomlBlock(repaired)
      if (next !== raw) {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, next, "utf-8")
        removed = true
      }
      continue
    }

    const existing = await loadJsonConfig(path)
    const pathRemoved = removeRelayFromJsonConfig(ide, existing)
    if (pathRemoved) {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify(existing, null, 2) + "\n", "utf-8")
      removed = true
    }
  }

  return removed
}

export async function validateInstalledMcpConfig(ide: DetectedIDE): Promise<boolean> {
  if (ide.configFormat === "toml-codex") {
    const raw = await loadCodexConfig(ide.mcpConfigPath)
    return /\[mcp_servers(?:\."?relay"?|\.relay)\]/.test(raw)
  }

  const existing = await loadJsonConfig(ide.mcpConfigPath)
  if (existing.mcpServers?.relay || existing.servers?.relay) return true
  if (existing.mcp && typeof existing.mcp === "object" && "relay" in existing.mcp) return true
  return false
}
