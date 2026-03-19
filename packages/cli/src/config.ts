import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

export interface RelayCliConfig {
  apiBase: string
  token: string
  projectId?: string
  accessToken?: string
  refreshToken?: string
  accessTokenExpiresAt?: string
  refreshTokenExpiresAt?: string
}

const CONFIG_DIR = join(homedir(), ".relay")
const CONFIG_PATH = join(CONFIG_DIR, "mcp.json")

export function getConfigPath(): string {
  return CONFIG_PATH
}

export async function loadConfig(): Promise<RelayCliConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8")
    const data = JSON.parse(raw) as Partial<RelayCliConfig>
    if (data.apiBase && data.token) {
      return {
        apiBase: data.apiBase,
        token: data.token,
        projectId: data.projectId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        accessTokenExpiresAt: data.accessTokenExpiresAt,
        refreshTokenExpiresAt: data.refreshTokenExpiresAt
      }
    }
    return null
  } catch {
    return null
  }
}

export async function saveConfig(config: RelayCliConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  const tempPath = `${CONFIG_PATH}.${process.pid}.tmp`
  await writeFile(tempPath, JSON.stringify(config, null, 2) + "\n", "utf-8")
  await rename(tempPath, CONFIG_PATH)
}

export async function requireConfig(): Promise<RelayCliConfig> {
  const config = await loadConfig()
  if (!config) {
    throw new Error("Relay is not configured. Run `relay install` or `relay auth login` first.")
  }

  return config
}

export async function clearConfig(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  const tempPath = `${CONFIG_PATH}.${process.pid}.tmp`
  await writeFile(tempPath, JSON.stringify({}, null, 2) + "\n", "utf-8")
  await rename(tempPath, CONFIG_PATH)
}
