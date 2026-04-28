import { readFile, writeFile, mkdir } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { dirname } from "node:path"

import type { DetectedIDE } from "./detect"
import { getMcpCommand } from "./detect"
import { applyJsoncEdits, parseJsonc, type JsoncEdit } from "./jsonc"

interface InstallMcpConfigOptions {
  mode?: "local" | "remote"
  remoteUrl?: string
  bearerToken?: string
  preferCli?: boolean
}

export type InstallMcpConfigStatus = "installed" | "updated" | "already-configured" | "skipped" | "failed"
export type InstallMcpConfigMethod = "config" | "cli" | "manual"

export interface InstallMcpConfigResult {
  clientId: DetectedIDE["id"]
  clientName: string
  status: InstallMcpConfigStatus
  method: InstallMcpConfigMethod
  path: string | null
  command: string | null
  message: string
  error?: string
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

export function buildManualMcpConfig(ide: DetectedIDE, options: InstallMcpConfigOptions = {}): GenericMcpServerConfig {
  const normalized: Required<InstallMcpConfigOptions> = {
    mode: options.mode ?? "local",
    remoteUrl: options.remoteUrl ?? "",
    bearerToken: options.bearerToken ?? "",
    preferCli: options.preferCli ?? true,
  }
  return buildRelayServerConfig(ide, normalized)
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

async function loadJsonConfig(path: string): Promise<{ raw: string; data: JsonMcpConfig }> {
  try {
    const raw = await readFile(path, "utf-8")
    return {
      raw,
      data: parseJsonc<JsonMcpConfig>(raw),
    }
  } catch {
    return {
      raw: "{}\n",
      data: {},
    }
  }
}

async function loadCodexConfig(path: string) {
  try {
    return await readFile(path, "utf-8")
  } catch {
    return ""
  }
}

function buildJsonInstallEdits(ide: DetectedIDE, relayConfig: GenericMcpServerConfig): JsoncEdit[] {
  if (ide.configFormat === "json-servers") {
    return [{ path: ["servers", "relay"], value: relayConfig }]
  }

  if (ide.configFormat === "json-opencode") {
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

    return [{ path: ["mcp", "relay"], value: nextRelay }]
  }

  return [{ path: ["mcpServers", "relay"], value: relayConfig }]
}

function buildJsonUninstallEdits(ide: DetectedIDE, existing: JsonMcpConfig): JsoncEdit[] {
  const edits: JsoncEdit[] = []

  if (existing.mcpServers?.relay) {
    edits.push({ path: ["mcpServers", "relay"], value: undefined })
    if (Object.keys(existing.mcpServers).length === 1) {
      edits.push({ path: ["mcpServers"], value: undefined })
    }
  }

  if (existing.servers?.relay) {
    edits.push({ path: ["servers", "relay"], value: undefined })
    if (Object.keys(existing.servers).length === 1) {
      edits.push({ path: ["servers"], value: undefined })
    }
  }

  if (ide.configFormat === "json-opencode" && existing.mcp && typeof existing.mcp === "object" && "relay" in existing.mcp) {
    const mcp = existing.mcp as Record<string, unknown>
    edits.push({ path: ["mcp", "relay"], value: undefined })
    if (Object.keys(mcp).length === 1) {
      edits.push({ path: ["mcp"], value: undefined })
    }
  }

  return edits
}

export async function installMcpConfig(
  ide: DetectedIDE,
  options: InstallMcpConfigOptions = {}
): Promise<void> {
  const result = await installMcpConfigDetailed(ide, { ...options, preferCli: options.preferCli ?? false })
  if (result.status === "failed") {
    throw new Error(result.error ?? result.message)
  }
}

function findBinary(names: readonly string[]) {
  for (const name of names) {
    const result = process.platform === "win32" ? spawnSync("where", [name], {
      stdio: "ignore",
    }) : spawnSync("sh", ["-c", `command -v ${JSON.stringify(name)}`], { stdio: "ignore" })
    if (result.status === 0) return name
  }
  return null
}

function runCliInstall(ide: DetectedIDE, options: Required<InstallMcpConfigOptions>): InstallMcpConfigResult | null {
  if (!options.preferCli) return null
  if (ide.detected !== true) return null
  if (ide.installMethod !== "cli" && ide.installMethod !== "cli-with-config-fallback") return null

  const binary = findBinary(ide.binaryNames)
  if (!binary) {
    if (ide.installMethod === "cli") {
      return {
        clientId: ide.id,
        clientName: ide.name,
        status: "failed",
        method: "cli",
        path: null,
        command: null,
        message: `${ide.name} CLI was not found.`,
        error: `${ide.name} CLI was not found.`,
      }
    }
    return null
  }

  let args: string[] | null = null
  if (ide.id === "claude") {
    if (options.mode === "remote") {
      args = ["mcp", "add", "--transport", "http", "relay", options.remoteUrl, "--header", `Authorization: Bearer ${options.bearerToken}`, "-s", "user"]
    } else {
      const { command, args: commandArgs } = getMcpCommand()
      args = ["mcp", "add", "relay", "-s", "user", "--", command, ...commandArgs]
    }
  }

  if (ide.id === "codex-cli" || ide.id === "codex-app") {
    if (options.mode === "remote") return null
    const { command, args: commandArgs } = getMcpCommand()
    args = ["mcp", "add", "relay", "--", command, ...commandArgs]
  }

  if (!args) return null

  const commandText = `${binary} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`
  const result = spawnSync(binary, args, {
    encoding: "utf-8",
    stdio: "pipe",
  })

  if (result.status === 0 && !result.error) {
    return {
      clientId: ide.id,
      clientName: ide.name,
      status: "installed",
      method: "cli",
      path: ide.mcpConfigPath,
      command: commandText,
      message: `${ide.name} configured via native CLI.`,
    }
  }

  if (ide.installMethod === "cli") {
    const error = result.error?.message || result.stderr?.trim() || `${ide.name} CLI install failed.`
    return {
      clientId: ide.id,
      clientName: ide.name,
      status: "failed",
      method: "cli",
      path: null,
      command: commandText,
      message: error,
      error,
    }
  }

  return null
}

export async function installMcpConfigDetailed(
  ide: DetectedIDE,
  options: InstallMcpConfigOptions = {}
): Promise<InstallMcpConfigResult> {
  const normalized: Required<InstallMcpConfigOptions> = {
    mode: options.mode ?? "local",
    remoteUrl: options.remoteUrl ?? "",
    bearerToken: options.bearerToken ?? "",
    preferCli: options.preferCli ?? true,
  }

  if (ide.installMethod === "manual" || ide.configFormat === "manual") {
    return {
      clientId: ide.id,
      clientName: ide.name,
      status: "skipped",
      method: "manual",
      path: ide.mcpConfigPath,
      command: null,
      message: ide.manualSetupNotes,
    }
  }

  const cliResult = runCliInstall(ide, normalized)
  if (cliResult) return cliResult

  const relayConfig = buildRelayServerConfig(ide, normalized)

  await mkdir(dirname(ide.mcpConfigPath), { recursive: true })

  if (ide.configFormat === "toml-codex") {
    const raw = await loadCodexConfig(ide.mcpConfigPath)
    const repaired = repairCodexToml(raw)
    const next = upsertCodexToml(repaired, buildCodexTomlBlock(ide, normalized))
    const existed = /\[mcp_servers(?:\."?relay"?|\.relay)\]/.test(raw)
    if (next === raw) {
      return {
        clientId: ide.id,
        clientName: ide.name,
        status: "already-configured",
        method: "config",
        path: ide.mcpConfigPath,
        command: null,
        message: `${ide.name} already has Relay MCP configured.`,
      }
    }
    await writeFile(ide.mcpConfigPath, next, "utf-8")
    return {
      clientId: ide.id,
      clientName: ide.name,
      status: existed ? "updated" : "installed",
      method: "config",
      path: ide.mcpConfigPath,
      command: null,
      message: `${ide.name} MCP config ${existed ? "updated" : "installed"}.`,
    }
  }

  const existing = await loadJsonConfig(ide.mcpConfigPath)
  const wasInstalled = Boolean(existing.data.mcpServers?.relay || existing.data.servers?.relay || (existing.data.mcp && typeof existing.data.mcp === "object" && "relay" in existing.data.mcp))
  const next = applyJsoncEdits(existing.raw, buildJsonInstallEdits(ide, relayConfig))
  if (!next.changed) {
    return {
      clientId: ide.id,
      clientName: ide.name,
      status: "already-configured",
      method: "config",
      path: ide.mcpConfigPath,
      command: null,
      message: `${ide.name} already has Relay MCP configured.`,
    }
  }
  await writeFile(ide.mcpConfigPath, next.text, "utf-8")
  return {
    clientId: ide.id,
    clientName: ide.name,
    status: wasInstalled ? "updated" : "installed",
    method: "config",
    path: ide.mcpConfigPath,
    command: null,
    message: `${ide.name} MCP config ${wasInstalled ? "updated" : "installed"}.`,
  }
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
    const uninstallEdits = buildJsonUninstallEdits(ide, existing.data)
    if (uninstallEdits.length > 0) {
      const next = applyJsoncEdits(existing.raw, uninstallEdits)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, next.text, "utf-8")
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
  if (existing.data.mcpServers?.relay || existing.data.servers?.relay) return true
  if (existing.data.mcp && typeof existing.data.mcp === "object" && "relay" in existing.data.mcp) return true
  return false
}
