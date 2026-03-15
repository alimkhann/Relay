import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

export interface RelayConfig {
  apiBase: string
  token: string
  projectId?: string
}

interface ConfigFile {
  apiBase?: string
  token?: string
  projectId?: string
}

const DEFAULT_API_BASE = "https://relay-flow.vercel.app"
const CONFIG_PATH = join(homedir(), ".relay", "mcp.json")

async function loadConfigFile(): Promise<ConfigFile> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8")
    return JSON.parse(raw) as ConfigFile
  } catch {
    return {}
  }
}

export async function loadConfig(): Promise<RelayConfig> {
  const file = await loadConfigFile()

  const token = process.env["RELAY_API_TOKEN"] ?? file.token
  if (!token) {
    throw new Error(
      "Relay API token not configured. Set RELAY_API_TOKEN env var or add token to ~/.relay/mcp.json"
    )
  }

  return {
    apiBase: process.env["RELAY_API_BASE"] ?? file.apiBase ?? DEFAULT_API_BASE,
    token,
    projectId: process.env["RELAY_PROJECT_ID"] ?? file.projectId
  }
}
