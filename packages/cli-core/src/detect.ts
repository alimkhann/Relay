import { readFileSync } from "node:fs"
import { join } from "node:path"
export {
  type DetectedIDE,
  detectIDEs,
  detectSupportedClients,
  getAllClients,
  resolveClientInstallTarget,
  getClientCompatibilityMatrix,
} from "./client-registry"

const RELAY_PUBLISHED_MCP_ARGS = ["-y", "-p", "@onrelay/mcp", "relay-mcp"] as const

export function isDevMode(): boolean {
  try {
    const cwd = process.cwd()
    const packageJsonPath = join(cwd, "package.json")
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
    return pkg.name === "relay"
  } catch {
    return false
  }
}

export function getMcpCommand(): { command: string; args: string[] } {
  const allowLocalDevMcp =
    process.env.RELAY_LOCAL_MCP_DEV === "1" ||
    process.env.RELAY_LOCAL_MCP_DEV === "true"

  if (allowLocalDevMcp && isDevMode()) {
    const cwd = process.cwd()
    return {
      command: "node",
      args: [join(cwd, "packages", "mcp", "dist", "index.js")]
    }
  }

  return {
    command: "npx",
    args: [...RELAY_PUBLISHED_MCP_ARGS]
  }
}
