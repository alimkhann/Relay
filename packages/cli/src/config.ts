import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

export interface RelayCliConfig {
  apiBase: string
  token: string
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
      return data as RelayCliConfig
    }
    return null
  } catch {
    return null
  }
}

export async function saveConfig(config: RelayCliConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8")
}
