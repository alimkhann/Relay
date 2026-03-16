import { access, constants } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

export interface DetectedIDE {
  name: string
  id: string
  mcpConfigPath: string
  skillDir: string | null
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function detectIDEs(): Promise<DetectedIDE[]> {
  const home = homedir()
  const ides: DetectedIDE[] = []

  // Claude Code (global) — config lives in ~/.claude.json, not ~/.claude/mcp.json
  if (await exists(join(home, ".claude"))) {
    ides.push({
      name: "Claude Code",
      id: "claude",
      mcpConfigPath: join(home, ".claude.json"),
      skillDir: join(home, ".claude", "skills", "relay")
    })
  }

  // Cursor (project-level — check cwd)
  const cwd = process.cwd()
  if (await exists(join(cwd, ".cursor"))) {
    ides.push({
      name: "Cursor (project)",
      id: "cursor-project",
      mcpConfigPath: join(cwd, ".cursor", "mcp.json"),
      skillDir: join(cwd, ".cursor", "rules")
    })
  }

  // Cursor (global)
  const cursorGlobalDir = process.platform === "darwin"
    ? join(home, "Library", "Application Support", "Cursor", "User", "globalStorage")
    : join(home, ".config", "cursor")
  if (await exists(cursorGlobalDir)) {
    ides.push({
      name: "Cursor (global)",
      id: "cursor-global",
      mcpConfigPath: join(cursorGlobalDir, "mcp.json"),
      skillDir: null
    })
  }

  // Windsurf
  const windsurfDir = process.platform === "darwin"
    ? join(home, "Library", "Application Support", "Windsurf", "User", "globalStorage")
    : join(home, ".config", "windsurf")
  if (await exists(windsurfDir)) {
    ides.push({
      name: "Windsurf",
      id: "windsurf",
      mcpConfigPath: join(windsurfDir, "mcp.json"),
      skillDir: null
    })
  }

  return ides
}

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
    args: ["-y", "@relay/mcp"]
  }
}
