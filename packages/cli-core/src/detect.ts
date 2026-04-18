import { readFileSync } from "node:fs"
import { join } from "node:path"
export { type DetectedIDE, detectIDEs, getClientCompatibilityMatrix } from "./client-registry"

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
  if (isDevMode()) {
    const cwd = process.cwd()
    return {
      command: "node",
      args: [join(cwd, "packages", "mcp", "dist", "index.js")]
    }
  }

  return {
    command: "npx",
    args: ["-y", "@onrelay/mcp"]
  }
}
