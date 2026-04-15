import { readFile, mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

export interface RelayConfig {
  apiBase: string
  token: string
  projectId?: string
  refreshToken?: string
  accessTokenExpiresAt?: string
  refreshTokenExpiresAt?: string
  /** CLI token kept as fallback when the scoped MCP token is rejected. */
  fallbackToken?: string
}

interface ConfigFile {
  apiBase?: string
  token?: string
  projectId?: string
  accessToken?: string
  refreshToken?: string
  accessTokenExpiresAt?: string
  refreshTokenExpiresAt?: string
}

const DEFAULT_API_BASE = "https://www.onrelay.app"
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

  const token = process.env["RELAY_API_TOKEN"] ?? file.accessToken ?? file.token
  if (!token) {
    throw new Error(
      "Relay API token not configured. Set RELAY_API_TOKEN env var or add token to ~/.relay/mcp.json"
    )
  }

  // Keep the CLI token as a fallback when the scoped MCP token is rejected
  const fallbackToken = file.token && file.token !== token ? file.token : undefined

  return {
    apiBase: process.env["RELAY_API_BASE"] ?? file.apiBase ?? DEFAULT_API_BASE,
    token,
    projectId: process.env["RELAY_PROJECT_ID"] ?? file.projectId,
    refreshToken: file.refreshToken,
    accessTokenExpiresAt: file.accessTokenExpiresAt,
    refreshTokenExpiresAt: file.refreshTokenExpiresAt,
    fallbackToken,
  }
}

export async function saveConfig(config: RelayConfig): Promise<void> {
  const existing = await loadConfigFile()
  await mkdir(join(homedir(), ".relay"), { recursive: true })
  const nextContent = JSON.stringify(
    {
      apiBase: config.apiBase,
      token: existing.token,
      accessToken: config.token,
      refreshToken: config.refreshToken,
      accessTokenExpiresAt: config.accessTokenExpiresAt,
      refreshTokenExpiresAt: config.refreshTokenExpiresAt,
      projectId: config.projectId
    },
    null,
    2
  ) + "\n"
  const tempPath = `${CONFIG_PATH}.${process.pid}.tmp`
  await writeFile(tempPath, nextContent, "utf-8")
  await rename(tempPath, CONFIG_PATH)
}
