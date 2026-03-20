import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import type { DetectedIDE } from "./detect"
import { getMcpCommand } from "./detect"

interface McpConfig {
  mcpServers?: Record<string, {
    command: string
    args?: string[]
    env?: Record<string, string>
  }>
}

export async function installMcpConfig(ide: DetectedIDE): Promise<void> {
  const existing = await loadMcpConfig(ide.mcpConfigPath)
  const { command, args } = getMcpCommand()

  existing.mcpServers = existing.mcpServers ?? {}
  existing.mcpServers["relay"] = {
    command,
    args
  }

  await mkdir(dirname(ide.mcpConfigPath), { recursive: true })
  await writeFile(ide.mcpConfigPath, JSON.stringify(existing, null, 2) + "\n", "utf-8")
}

export async function uninstallMcpConfig(ide: DetectedIDE): Promise<boolean> {
  const existing = await loadMcpConfig(ide.mcpConfigPath)
  if (!existing.mcpServers?.relay) {
    return false
  }

  delete existing.mcpServers.relay

  if (Object.keys(existing.mcpServers).length === 0) {
    delete existing.mcpServers
  }

  await mkdir(dirname(ide.mcpConfigPath), { recursive: true })
  await writeFile(ide.mcpConfigPath, JSON.stringify(existing, null, 2) + "\n", "utf-8")
  return true
}

async function loadMcpConfig(path: string): Promise<McpConfig> {
  try {
    const raw = await readFile(path, "utf-8")
    return JSON.parse(raw) as McpConfig
  } catch {
    return {}
  }
}
