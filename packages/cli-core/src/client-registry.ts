import { access, constants } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

import {
  RELAY_MCP_CLIENTS,
  getRelayMcpClientDescriptor,
  type RelayMcpClientDescriptor,
  type RelayMcpClientId,
} from "../../shared/src/index"

export interface DetectedIDE extends RelayMcpClientDescriptor {
  mcpConfigPath: string
  instructionPath: string | null
  legacyConfigPaths: string[]
}

interface DetectionContext {
  cwd: string
  home: string
}

interface ClientRegistryEntry {
  id: RelayMcpClientId
  detect: (context: DetectionContext) => Promise<DetectedIDE | null>
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function buildDetectedIDE(
  id: RelayMcpClientId,
  input: {
    mcpConfigPath: string
    instructionPath?: string | null
    legacyConfigPaths?: string[]
  }
): DetectedIDE {
  const descriptor = getRelayMcpClientDescriptor(id)
  if (!descriptor) {
    throw new Error(`Unknown MCP client descriptor: ${id}`)
  }

  return {
    ...descriptor,
    mcpConfigPath: input.mcpConfigPath,
    instructionPath: input.instructionPath ?? descriptor.instructionPathLabel ?? null,
    legacyConfigPaths: input.legacyConfigPaths ?? [],
  }
}

function pushIfMissing(ides: DetectedIDE[], next: DetectedIDE) {
  if (!ides.some((ide) => ide.id === next.id || ide.mcpConfigPath === next.mcpConfigPath)) {
    ides.push(next)
  }
}

const CLIENT_REGISTRY: readonly ClientRegistryEntry[] = [
  {
    id: "claude",
    detect: async ({ home }) => {
      const configPath = join(home, ".claude.json")
      const configDir = join(home, ".claude")
      if (!(await exists(configPath)) && !(await exists(configDir))) return null
      return buildDetectedIDE("claude", {
        mcpConfigPath: configPath,
        instructionPath: join(configDir, "settings.json"),
      })
    },
  },
  {
    id: "claude-desktop",
    detect: async ({ home }) => {
      const macPath = join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
      const linuxPath = join(home, ".config", "claude-desktop", "claude_desktop_config.json")
      const configPath = process.platform === "darwin" ? macPath : linuxPath
      if (!(await exists(configPath)) && !(await exists(join(home, ".config", "claude-desktop"))) && !(await exists(join(home, "Library", "Application Support", "Claude")))) {
        return null
      }
      return buildDetectedIDE("claude-desktop", {
        mcpConfigPath: configPath,
      })
    },
  },
  {
    id: "cursor-project",
    detect: async ({ cwd }) => {
      const cursorDir = join(cwd, ".cursor")
      if (!(await exists(cursorDir))) return null
      return buildDetectedIDE("cursor-project", {
        mcpConfigPath: join(cursorDir, "mcp.json"),
        instructionPath: join(cursorDir, "rules"),
      })
    },
  },
  {
    id: "cursor-global",
    detect: async ({ home }) => {
      const configPath = join(home, ".cursor", "mcp.json")
      const legacyPath = process.platform === "darwin"
        ? join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "mcp.json")
        : join(home, ".config", "cursor", "mcp.json")
      if (!(await exists(configPath)) && !(await exists(legacyPath)) && !(await exists(join(home, ".cursor")))) return null
      return buildDetectedIDE("cursor-global", {
        mcpConfigPath: configPath,
        instructionPath: "AGENTS.md or Cursor user rules",
        legacyConfigPaths: [legacyPath],
      })
    },
  },
  {
    id: "vscode",
    detect: async ({ home }) => {
      const macPath = join(home, "Library", "Application Support", "Code", "User", "mcp.json")
      const linuxPath = join(home, ".config", "Code", "User", "mcp.json")
      const configPath = process.platform === "darwin" ? macPath : linuxPath
      if (!(await exists(configPath)) && !(await exists(dirnameOf(configPath)))) return null
      return buildDetectedIDE("vscode", {
        mcpConfigPath: configPath,
        instructionPath: "AGENTS.md",
      })
    },
  },
  {
    id: "windsurf",
    detect: async ({ home }) => {
      const configPath = join(home, ".codeium", "mcp_config.json")
      const legacyPath = process.platform === "darwin"
        ? join(home, "Library", "Application Support", "Windsurf", "User", "globalStorage", "mcp.json")
        : join(home, ".config", "windsurf", "mcp.json")
      if (!(await exists(configPath)) && !(await exists(legacyPath)) && !(await exists(join(home, ".codeium")))) return null
      return buildDetectedIDE("windsurf", {
        mcpConfigPath: configPath,
        instructionPath: ".windsurfrules or project rules",
        legacyConfigPaths: [legacyPath],
      })
    },
  },
  {
    id: "codex-cli",
    detect: async ({ home }) => {
      const configPath = join(home, ".codex", "config.toml")
      const legacyPath = join(home, ".codex", "mcp.json")
      if (!(await exists(configPath)) && !(await exists(legacyPath)) && !(await exists(join(home, ".codex")))) return null
      return buildDetectedIDE("codex-cli", {
        mcpConfigPath: configPath,
        instructionPath: join(home, ".codex", "AGENTS.md"),
        legacyConfigPaths: [legacyPath],
      })
    },
  },
  {
    id: "opencode",
    detect: async ({ cwd, home }) => {
      const projectJsonc = join(cwd, "opencode.jsonc")
      const projectJson = join(cwd, "opencode.json")
      const globalJson = join(home, ".config", "opencode", "opencode.json")
      const globalJsonc = join(home, ".config", "opencode", "opencode.jsonc")
      const legacyPaths = [join(cwd, ".opencode", "mcp.json"), join(home, ".opencode", "mcp.json")]
      const detectedPath =
        (await exists(projectJsonc)) ? projectJsonc :
        (await exists(projectJson)) ? projectJson :
        (await exists(globalJson)) ? globalJson :
        (await exists(globalJsonc)) ? globalJsonc :
        (await exists(join(home, ".config", "opencode"))) ? globalJson :
        null
      if (!detectedPath && !(await Promise.all(legacyPaths.map((path) => exists(path))).then((values) => values.some(Boolean)))) {
        return null
      }
      return buildDetectedIDE("opencode", {
        mcpConfigPath: detectedPath ?? globalJson,
        instructionPath: detectedPath ?? globalJson,
        legacyConfigPaths: legacyPaths,
      })
    },
  },
  {
    id: "gemini-cli",
    detect: async ({ home }) => {
      const configPath = join(home, ".gemini", "settings.json")
      const fallbackPath = join(home, ".config", "gemini", "settings.json")
      const legacyPath = join(home, ".gemini", "mcp.json")
      const hasPrimaryDir = await exists(join(home, ".gemini"))
      if (!(await exists(configPath)) && !(await exists(fallbackPath)) && !(await exists(legacyPath)) && !hasPrimaryDir) {
        return null
      }
      return buildDetectedIDE("gemini-cli", {
        mcpConfigPath: (await exists(configPath)) || hasPrimaryDir ? configPath : fallbackPath,
        legacyConfigPaths: [legacyPath],
      })
    },
  },
  {
    id: "warp",
    detect: async ({ home }) => {
      const configPath = join(home, ".warp", "mcp.json")
      const fallbackPath = join(home, ".config", "warp-terminal", "mcp.json")
      const hasPrimaryDir = await exists(join(home, ".warp"))
      if (!(await exists(configPath)) && !(await exists(fallbackPath)) && !hasPrimaryDir) return null
      return buildDetectedIDE("warp", {
        mcpConfigPath: (await exists(configPath)) || hasPrimaryDir ? configPath : fallbackPath,
        instructionPath: "WARP.md",
      })
    },
  },
  {
    id: "antigravity",
    detect: async ({ home }) => {
      const configPath = join(home, ".antigravity", "mcp.json")
      const fallbackPath = join(home, ".config", "antigravity", "mcp.json")
      const hasPrimaryDir = await exists(join(home, ".antigravity"))
      if (!(await exists(configPath)) && !(await exists(fallbackPath)) && !hasPrimaryDir) return null
      return buildDetectedIDE("antigravity", {
        mcpConfigPath: (await exists(configPath)) || hasPrimaryDir ? configPath : fallbackPath,
      })
    },
  },
] as const

function dirnameOf(path: string) {
  const slash = path.lastIndexOf("/")
  return slash >= 0 ? path.slice(0, slash) : "."
}

export async function detectIDEs(cwd = process.cwd()): Promise<DetectedIDE[]> {
  const context: DetectionContext = { cwd, home: homedir() }
  const ides: DetectedIDE[] = []

  for (const entry of CLIENT_REGISTRY) {
    const detected = await entry.detect(context)
    if (detected) {
      pushIfMissing(ides, detected)
    }
  }

  return ides
}

export function getClientCompatibilityMatrix() {
  return RELAY_MCP_CLIENTS
}
