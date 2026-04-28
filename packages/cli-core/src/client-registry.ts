import { access, constants } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { homedir } from "node:os"

import {
  RELAY_MCP_CLIENT_CATALOG,
  getRelayMcpClientDescriptor,
  type RelayMcpClientDescriptor,
  type RelayMcpClientId,
} from "../../shared/src/index"

export interface DetectedIDE extends RelayMcpClientDescriptor {
  workspaceRoot: string
  mcpConfigPath: string
  clientSetupPath: string | null
  legacyConfigPaths: string[]
  detected?: boolean
  detectionReason?: string
}

interface DetectionContext {
  cwd: string
  home: string
}

interface ClientRegistryEntry {
  id: RelayMcpClientId
  resolve: (context: DetectionContext) => Promise<DetectedIDE>
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
    workspaceRoot: string
    mcpConfigPath: string
    clientSetupPath?: string | null
    legacyConfigPaths?: string[]
    detected?: boolean
    detectionReason?: string
  }
): DetectedIDE {
  const descriptor = getRelayMcpClientDescriptor(id)
  if (!descriptor) {
    throw new Error(`Unknown MCP client descriptor: ${id}`)
  }

  return {
    ...descriptor,
    workspaceRoot: input.workspaceRoot,
    mcpConfigPath: input.mcpConfigPath,
    clientSetupPath: input.clientSetupPath ?? null,
    legacyConfigPaths: input.legacyConfigPaths ?? [],
    detected: input.detected ?? true,
    detectionReason: input.detectionReason ?? "detected",
  }
}

function pushIfMissing(ides: DetectedIDE[], next: DetectedIDE) {
  if (!ides.some((ide) => ide.id === next.id || ide.mcpConfigPath === next.mcpConfigPath)) {
    ides.push(next)
  }
}

function commandExists(command: string): boolean {
  if (!command) return false
  const result = process.platform === "win32" ? spawnSync("where", [command], {
    stdio: "ignore",
  }) : spawnSync("sh", ["-c", `command -v ${JSON.stringify(command)}`], { stdio: "ignore" })
  return result.status === 0
}

async function anyExists(paths: string[]) {
  const values = await Promise.all(paths.map((path) => exists(path)))
  return values.some(Boolean)
}

function genericConfigPath(id: RelayMcpClientId, context: DetectionContext) {
  return join(context.home, ".relay", "manual-mcp", `${id}.json`)
}

function buildManualTarget(id: RelayMcpClientId, context: DetectionContext, reason = "manual setup available") {
  const descriptor = getRelayMcpClientDescriptor(id)
  const detectedByBinary = descriptor?.binaryNames.some(commandExists) ?? false
  return buildDetectedIDE(id, {
    workspaceRoot: context.cwd,
    mcpConfigPath: genericConfigPath(id, context),
    detected: detectedByBinary,
    detectionReason: detectedByBinary ? "binary found" : reason,
  })
}

const CLIENT_REGISTRY: readonly ClientRegistryEntry[] = [
  {
    id: "claude",
    resolve: async ({ cwd, home }) => {
      const configPath = join(home, ".claude.json")
      const configDir = join(home, ".claude")
      return buildDetectedIDE("claude", {
        workspaceRoot: cwd,
        mcpConfigPath: configPath,
        clientSetupPath: join(configDir, "settings.json"),
        detected: await anyExists([configPath, configDir]) || commandExists("claude"),
        detectionReason: "Claude Code config or CLI",
      })
    },
  },
  {
    id: "claude-desktop",
    resolve: async ({ cwd, home }) => {
      const macPath = join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
      const linuxPath = join(home, ".config", "claude-desktop", "claude_desktop_config.json")
      const configPath = process.platform === "darwin" ? macPath : linuxPath
      return buildDetectedIDE("claude-desktop", {
        workspaceRoot: cwd,
        mcpConfigPath: configPath,
        detected: await anyExists([configPath, join(home, ".config", "claude-desktop"), join(home, "Library", "Application Support", "Claude")]),
        detectionReason: "Claude Desktop config directory",
      })
    },
  },
  {
    id: "cursor-project",
    resolve: async ({ cwd }) => {
      const cursorDir = join(cwd, ".cursor")
      return buildDetectedIDE("cursor-project", {
        workspaceRoot: cwd,
        mcpConfigPath: join(cursorDir, "mcp.json"),
        detected: await exists(cursorDir),
        detectionReason: "project .cursor directory",
      })
    },
  },
  {
    id: "cursor-global",
    resolve: async ({ cwd, home }) => {
      const configPath = join(home, ".cursor", "mcp.json")
      const legacyPath = process.platform === "darwin"
        ? join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "mcp.json")
        : join(home, ".config", "cursor", "mcp.json")
      return buildDetectedIDE("cursor-global", {
        workspaceRoot: cwd,
        mcpConfigPath: configPath,
        legacyConfigPaths: [legacyPath],
        detected: await anyExists([configPath, legacyPath, join(home, ".cursor")]),
        detectionReason: "Cursor config directory",
      })
    },
  },
  {
    id: "vscode",
    resolve: async ({ cwd, home }) => {
      const macPath = join(home, "Library", "Application Support", "Code", "User", "mcp.json")
      const linuxPath = join(home, ".config", "Code", "User", "mcp.json")
      const configPath = process.platform === "darwin" ? macPath : linuxPath
      return buildDetectedIDE("vscode", {
        workspaceRoot: cwd,
        mcpConfigPath: configPath,
        detected: await anyExists([configPath, dirnameOf(configPath)]) || commandExists("code"),
        detectionReason: "VS Code config directory or code CLI",
      })
    },
  },
  {
    id: "windsurf",
    resolve: async ({ cwd, home }) => {
      const configPath = join(home, ".codeium", "mcp_config.json")
      const legacyPath = process.platform === "darwin"
        ? join(home, "Library", "Application Support", "Windsurf", "User", "globalStorage", "mcp.json")
        : join(home, ".config", "windsurf", "mcp.json")
      return buildDetectedIDE("windsurf", {
        workspaceRoot: cwd,
        mcpConfigPath: configPath,
        clientSetupPath: join(home, ".codeium", "windsurf", "hooks.json"),
        legacyConfigPaths: [legacyPath],
        detected: await anyExists([configPath, legacyPath, join(home, ".codeium")]) || commandExists("windsurf"),
        detectionReason: "Windsurf config directory or CLI",
      })
    },
  },
  {
    id: "codex-cli",
    resolve: async ({ cwd, home }) => {
      const configPath = join(home, ".codex", "config.toml")
      const legacyPath = join(home, ".codex", "mcp.json")
      return buildDetectedIDE("codex-cli", {
        workspaceRoot: cwd,
        mcpConfigPath: configPath,
        legacyConfigPaths: [legacyPath],
        detected: await anyExists([configPath, legacyPath, join(home, ".codex")]) || commandExists("codex"),
        detectionReason: "Codex config directory or CLI",
      })
    },
  },
  {
    id: "codex-app",
    resolve: async ({ cwd, home }) => {
      const configPath = join(home, ".codex", "config.toml")
      return buildDetectedIDE("codex-app", {
        workspaceRoot: cwd,
        mcpConfigPath: configPath,
        detected: await anyExists([configPath, join(home, ".codex")]) || commandExists("codex"),
        detectionReason: "Codex shared config",
      })
    },
  },
  {
    id: "opencode",
    resolve: async ({ cwd, home }) => {
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
      return buildDetectedIDE("opencode", {
        workspaceRoot: cwd,
        mcpConfigPath: detectedPath ?? globalJson,
        legacyConfigPaths: legacyPaths,
        detected: Boolean(detectedPath) || await anyExists(legacyPaths) || commandExists("opencode"),
        detectionReason: "OpenCode config or CLI",
      })
    },
  },
  {
    id: "gemini-cli",
    resolve: async ({ cwd, home }) => {
      const configPath = join(home, ".gemini", "settings.json")
      const fallbackPath = join(home, ".config", "gemini", "settings.json")
      const legacyPath = join(home, ".gemini", "mcp.json")
      const hasPrimaryDir = await exists(join(home, ".gemini"))
      return buildDetectedIDE("gemini-cli", {
        workspaceRoot: cwd,
        mcpConfigPath: (await exists(configPath)) || hasPrimaryDir ? configPath : fallbackPath,
        clientSetupPath: (await exists(configPath)) || hasPrimaryDir ? configPath : fallbackPath,
        legacyConfigPaths: [legacyPath],
        detected: await anyExists([configPath, fallbackPath, legacyPath]) || hasPrimaryDir || commandExists("gemini"),
        detectionReason: "Gemini CLI config directory or CLI",
      })
    },
  },
  {
    id: "warp",
    resolve: async ({ cwd, home }) => {
      const configPath = join(home, ".warp", "mcp.json")
      const fallbackPath = join(home, ".config", "warp-terminal", "mcp.json")
      const hasPrimaryDir = await exists(join(home, ".warp"))
      return buildDetectedIDE("warp", {
        workspaceRoot: cwd,
        mcpConfigPath: (await exists(configPath)) || hasPrimaryDir ? configPath : fallbackPath,
        detected: await anyExists([configPath, fallbackPath]) || hasPrimaryDir || commandExists("warp"),
        detectionReason: "Warp config directory or CLI",
      })
    },
  },
  {
    id: "antigravity",
    resolve: async ({ cwd, home }) => {
      const configPath = join(home, ".antigravity", "mcp.json")
      const fallbackPath = join(home, ".config", "antigravity", "mcp.json")
      const hasPrimaryDir = await exists(join(home, ".antigravity"))
      return buildDetectedIDE("antigravity", {
        workspaceRoot: cwd,
        mcpConfigPath: (await exists(configPath)) || hasPrimaryDir ? configPath : fallbackPath,
        detected: await anyExists([configPath, fallbackPath]) || hasPrimaryDir,
        detectionReason: "Antigravity config directory",
      })
    },
  },
  ...RELAY_MCP_CLIENT_CATALOG
    .filter((client) => ![
      "claude",
      "claude-desktop",
      "cursor-project",
      "cursor-global",
      "vscode",
      "windsurf",
      "codex-cli",
      "codex-app",
      "opencode",
      "gemini-cli",
      "warp",
      "antigravity",
    ].includes(client.id))
    .map((client): ClientRegistryEntry => ({
      id: client.id,
      resolve: async (context) => buildManualTarget(client.id, context),
    })),
] as const

function dirnameOf(path: string) {
  const slash = path.lastIndexOf("/")
  return slash >= 0 ? path.slice(0, slash) : "."
}

export async function detectIDEs(cwd = process.cwd()): Promise<DetectedIDE[]> {
  return detectSupportedClients(cwd)
}

export async function getAllClients(cwd = process.cwd()): Promise<DetectedIDE[]> {
  const context: DetectionContext = { cwd, home: homedir() }
  const ides: DetectedIDE[] = []

  for (const entry of CLIENT_REGISTRY) {
    pushIfMissing(ides, await entry.resolve(context))
  }

  return ides
}

export async function detectSupportedClients(cwd = process.cwd()): Promise<DetectedIDE[]> {
  return (await getAllClients(cwd)).filter((ide) => ide.detected === true)
}

export async function resolveClientInstallTarget(id: RelayMcpClientId, cwd = process.cwd()): Promise<DetectedIDE | null> {
  return (await getAllClients(cwd)).find((ide) => ide.id === id) ?? null
}

export function getClientCompatibilityMatrix() {
  return RELAY_MCP_CLIENT_CATALOG
}
