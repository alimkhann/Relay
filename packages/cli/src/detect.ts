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

function pushIfMissing(ides: DetectedIDE[], next: DetectedIDE) {
  if (!ides.some((ide) => ide.id === next.id || ide.mcpConfigPath === next.mcpConfigPath)) {
    ides.push(next)
  }
}

export async function detectIDEs(): Promise<DetectedIDE[]> {
  const home = homedir()
  const ides: DetectedIDE[] = []

  // Claude Code (global) — config lives in ~/.claude.json, not ~/.claude/mcp.json
  if (await exists(join(home, ".claude"))) {
    pushIfMissing(ides, {
      name: "Claude Code",
      id: "claude",
      mcpConfigPath: join(home, ".claude.json"),
      skillDir: join(home, ".claude", "skills", "relay")
    })
  }

  if (await exists(join(home, "Library", "Application Support", "Claude")) || await exists(join(home, ".config", "claude-desktop"))) {
    pushIfMissing(ides, {
      name: "Claude Desktop",
      id: "claude-desktop",
      mcpConfigPath: process.platform === "darwin"
        ? join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
        : join(home, ".config", "claude-desktop", "claude_desktop_config.json"),
      skillDir: null
    })
  }

  // Cursor (project-level — check cwd)
  const cwd = process.cwd()
  if (await exists(join(cwd, ".cursor"))) {
    pushIfMissing(ides, {
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
    pushIfMissing(ides, {
      name: "Cursor (global)",
      id: "cursor-global",
      mcpConfigPath: join(cursorGlobalDir, "mcp.json"),
      skillDir: null
    })
  }

  const vscodeUserDir = process.platform === "darwin"
    ? join(home, "Library", "Application Support", "Code", "User")
    : join(home, ".config", "Code", "User")
  if (await exists(vscodeUserDir)) {
    pushIfMissing(ides, {
      name: "VS Code",
      id: "vscode",
      mcpConfigPath: join(vscodeUserDir, "mcp.json"),
      skillDir: null
    })
  }

  // Windsurf
  const windsurfDir = process.platform === "darwin"
    ? join(home, "Library", "Application Support", "Windsurf", "User", "globalStorage")
    : join(home, ".config", "windsurf")
  if (await exists(windsurfDir)) {
    pushIfMissing(ides, {
      name: "Windsurf",
      id: "windsurf",
      mcpConfigPath: join(windsurfDir, "mcp.json"),
      skillDir: null
    })
  }

  const codexDir = await exists(join(home, ".codex")) || await exists(join(home, ".config", "codex"))
  if (codexDir) {
    pushIfMissing(ides, {
      name: "OpenAI Codex CLI",
      id: "codex-cli",
      mcpConfigPath: await exists(join(home, ".codex"))
        ? join(home, ".codex", "mcp.json")
        : join(home, ".config", "codex", "mcp.json"),
      skillDir: null
    })
  }

  const opencodeDir = await exists(join(home, ".opencode")) || await exists(join(cwd, ".opencode"))
  if (opencodeDir) {
    pushIfMissing(ides, {
      name: "OpenCode",
      id: "opencode",
      mcpConfigPath: await exists(join(cwd, ".opencode"))
        ? join(cwd, ".opencode", "mcp.json")
        : join(home, ".opencode", "mcp.json"),
      skillDir: join(home, ".agents", "skills", "relay")
    })
  }

  const geminiDir = await exists(join(home, ".gemini")) || await exists(join(home, ".config", "gemini"))
  if (geminiDir) {
    pushIfMissing(ides, {
      name: "Gemini CLI",
      id: "gemini-cli",
      mcpConfigPath: await exists(join(home, ".gemini"))
        ? join(home, ".gemini", "mcp.json")
        : join(home, ".config", "gemini", "mcp.json"),
      skillDir: null
    })
  }

  const warpDir = process.platform === "darwin"
    ? join(home, ".warp")
    : join(home, ".config", "warp-terminal")
  if (await exists(warpDir)) {
    pushIfMissing(ides, {
      name: "Warp",
      id: "warp",
      mcpConfigPath: join(warpDir, "mcp.json"),
      skillDir: null
    })
  }

  const antigravityDir = await exists(join(home, ".antigravity")) || await exists(join(home, ".config", "antigravity"))
  if (antigravityDir) {
    pushIfMissing(ides, {
      name: "Antigravity",
      id: "antigravity",
      mcpConfigPath: await exists(join(home, ".antigravity"))
        ? join(home, ".antigravity", "mcp.json")
        : join(home, ".config", "antigravity", "mcp.json"),
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
