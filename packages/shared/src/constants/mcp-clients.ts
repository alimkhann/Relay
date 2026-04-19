export type RelayMcpClientId =
  | "claude"
  | "claude-desktop"
  | "cursor-project"
  | "cursor-global"
  | "vscode"
  | "windsurf"
  | "codex-cli"
  | "opencode"
  | "gemini-cli"
  | "warp"
  | "antigravity"

export type RelayMcpSupportTier = "validated" | "supported" | "experimental"
export type RelayMcpTransportMode = "local" | "remote"
export type RelayMcpInstallLayer = "mcp" | "instructions" | "rules" | "hooks" | "skills"
export type RelayMcpInstallScope = "user" | "workspace"

export type RelayMcpConfigFormat =
  | "json-mcpServers"
  | "json-servers"
  | "json-opencode"
  | "toml-codex"

export interface RelayMcpClientDescriptor {
  id: RelayMcpClientId
  name: string
  supportTier: RelayMcpSupportTier
  configFormat: RelayMcpConfigFormat
  mcpConfig: string
  mcpScopes: readonly RelayMcpInstallScope[]
  supportedTransports: readonly RelayMcpTransportMode[]
  repoInstructions: readonly string[]
  userInstructions: readonly string[]
  workspaceHooks: readonly string[]
  userHooks: readonly string[]
  instructionSurfaces: readonly string[]
  ruleSurfaces: readonly string[]
  hookSurfaces: readonly string[]
  skillSurfaces: readonly string[]
  defaultInstallLayers: readonly RelayMcpInstallLayer[]
  officialDocsUrl: string
  lastVerifiedAt: string
}

export const RELAY_MCP_CLIENTS: readonly RelayMcpClientDescriptor[] = [
  {
    id: "claude",
    name: "Claude Code",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    mcpConfig: "~/.claude.json",
    mcpScopes: ["user"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["CLAUDE.md"],
    userInstructions: ["~/.claude/CLAUDE.md"],
    workspaceHooks: [],
    userHooks: ["~/.claude/settings.json"],
    instructionSurfaces: ["CLAUDE.md", "~/.claude/CLAUDE.md"],
    ruleSurfaces: [],
    hookSurfaces: ["~/.claude/settings.json"],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp", "instructions", "hooks"],
    officialDocsUrl: "https://code.claude.com/docs/en/mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    mcpConfig: "claude_desktop_config.json",
    mcpScopes: ["user"],
    supportedTransports: ["local", "remote"],
    repoInstructions: [],
    userInstructions: [],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: [],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp"],
    officialDocsUrl: "https://code.claude.com/docs/en/mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "cursor-project",
    name: "Cursor (project)",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    mcpConfig: ".cursor/mcp.json",
    mcpScopes: ["workspace"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", ".cursor/rules/*.mdc"],
    userInstructions: ["Cursor user rules"],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["AGENTS.md"],
    ruleSurfaces: [".cursor/rules/*.mdc"],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp", "rules"],
    officialDocsUrl: "https://docs.cursor.com/context/model-context-protocol",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "cursor-global",
    name: "Cursor (global)",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    mcpConfig: "~/.cursor/mcp.json",
    mcpScopes: ["user"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", ".cursor/rules/*.mdc"],
    userInstructions: ["Cursor user rules"],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["AGENTS.md"],
    ruleSurfaces: [".cursor/rules/*.mdc"],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp", "rules"],
    officialDocsUrl: "https://docs.cursor.com/context/model-context-protocol",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "vscode",
    name: "VS Code",
    supportTier: "supported",
    configFormat: "json-servers",
    mcpConfig: "User mcp.json or .vscode/mcp.json",
    mcpScopes: ["user", "workspace"],
    supportedTransports: ["local", "remote"],
    repoInstructions: [
      "AGENTS.md",
      ".github/copilot-instructions.md",
      ".github/instructions/*.instructions.md",
    ],
    userInstructions: ["VS Code user instruction files"],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: [".github/copilot-instructions.md", ".github/instructions/*.instructions.md", "AGENTS.md"],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp", "instructions"],
    officialDocsUrl: "https://code.visualstudio.com/docs/copilot/customization/custom-instructions",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    supportTier: "supported",
    configFormat: "json-mcpServers",
    mcpConfig: "~/.codeium/mcp_config.json",
    mcpScopes: ["user"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", ".windsurf/rules/*"],
    userInstructions: ["~/.codeium/windsurf/memories/global_rules.md"],
    workspaceHooks: [".windsurf/hooks.json"],
    userHooks: ["~/.codeium/windsurf/hooks.json"],
    instructionSurfaces: ["AGENTS.md"],
    ruleSurfaces: [".windsurf/rules/*", "~/.codeium/windsurf/memories/global_rules.md"],
    hookSurfaces: [".windsurf/hooks.json", "~/.codeium/windsurf/hooks.json"],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp", "rules", "hooks"],
    officialDocsUrl: "https://docs.windsurf.com/plugins/cascade/memories",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "codex-cli",
    name: "OpenAI Codex",
    supportTier: "validated",
    configFormat: "toml-codex",
    mcpConfig: "~/.codex/config.toml",
    mcpScopes: ["user"],
    supportedTransports: ["local"],
    repoInstructions: ["AGENTS.md"],
    userInstructions: [
      "$CODEX_HOME/AGENTS.md",
      "$CODEX_HOME/AGENTS.override.md",
      "model_instructions_file in ~/.codex/config.toml",
    ],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["AGENTS.md", "$CODEX_HOME/AGENTS.md", "model_instructions_file"],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: ["$CODEX_HOME/skills/*/SKILL.md"],
    defaultInstallLayers: ["mcp", "instructions"],
    officialDocsUrl: "https://developers.openai.com/learn/docs-mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "opencode",
    name: "OpenCode",
    supportTier: "supported",
    configFormat: "json-opencode",
    mcpConfig: "~/.config/opencode/opencode.json or opencode.json",
    mcpScopes: ["user", "workspace"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", "opencode.json[c] instructions"],
    userInstructions: [
      "~/.config/opencode/AGENTS.md",
      "~/.config/opencode/opencode.json[c] instructions",
    ],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["opencode.json[c] instructions", "AGENTS.md"],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: [".opencode/skills/*/SKILL.md", ".agents/skills/*/SKILL.md"],
    defaultInstallLayers: ["mcp", "instructions", "skills"],
    officialDocsUrl: "https://open-code.ai/docs/en/config",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    mcpConfig: "~/.gemini/settings.json",
    mcpScopes: ["user", "workspace"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["GEMINI.md", "AGENTS.md (if added to context.fileName)"],
    userInstructions: ["~/.gemini/GEMINI.md"],
    workspaceHooks: [".gemini/settings.json"],
    userHooks: ["~/.gemini/settings.json"],
    instructionSurfaces: ["GEMINI.md", "~/.gemini/GEMINI.md", "AGENTS.md (via context.fileName)"],
    ruleSurfaces: [],
    hookSurfaces: [".gemini/settings.json", "~/.gemini/settings.json"],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp", "instructions", "hooks"],
    officialDocsUrl: "https://geminicli.com/docs/reference/configuration/",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "warp",
    name: "Warp",
    supportTier: "supported",
    configFormat: "json-mcpServers",
    mcpConfig: "~/.warp/mcp.json",
    mcpScopes: ["user"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", "WARP.md (legacy)"],
    userInstructions: ["Warp global rules"],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["AGENTS.md", "Warp global rules"],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp"],
    officialDocsUrl: "https://docs.warp.dev/agent-platform/capabilities/rules",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    supportTier: "experimental",
    configFormat: "json-mcpServers",
    mcpConfig: "Experimental raw MCP config (client-managed)",
    mcpScopes: ["user"],
    supportedTransports: ["local", "remote"],
    repoInstructions: [],
    userInstructions: [],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: [],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp"],
    officialDocsUrl: "https://antigravity.codes/blog/antigravity-mcp-tutorial",
    lastVerifiedAt: "2026-04-19",
  },
] as const

export function getRelayMcpClientDescriptor(id: RelayMcpClientId) {
  return RELAY_MCP_CLIENTS.find((client) => client.id === id) ?? null
}
