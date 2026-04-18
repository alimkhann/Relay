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
  supportedTransports: readonly RelayMcpTransportMode[]
  repoInstructions: readonly string[]
  userInstructions: readonly string[]
  workspaceHooks: readonly string[]
  userHooks: readonly string[]
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
    supportedTransports: ["local", "remote"],
    repoInstructions: ["CLAUDE.md"],
    userInstructions: ["~/.claude/CLAUDE.md"],
    workspaceHooks: [],
    userHooks: ["~/.claude/settings.json"],
    officialDocsUrl: "https://code.claude.com/docs/en/mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    mcpConfig: "claude_desktop_config.json",
    supportedTransports: ["local", "remote"],
    repoInstructions: [],
    userInstructions: [],
    workspaceHooks: [],
    userHooks: [],
    officialDocsUrl: "https://code.claude.com/docs/en/mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "cursor-project",
    name: "Cursor (project)",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    mcpConfig: ".cursor/mcp.json",
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", ".cursor/rules/*.mdc"],
    userInstructions: ["Cursor user rules"],
    workspaceHooks: [],
    userHooks: [],
    officialDocsUrl: "https://docs.cursor.com/context/model-context-protocol",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "cursor-global",
    name: "Cursor (global)",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    mcpConfig: "~/.cursor/mcp.json",
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", ".cursor/rules/*.mdc"],
    userInstructions: ["Cursor user rules"],
    workspaceHooks: [],
    userHooks: [],
    officialDocsUrl: "https://docs.cursor.com/context/model-context-protocol",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "vscode",
    name: "VS Code",
    supportTier: "supported",
    configFormat: "json-servers",
    mcpConfig: "User mcp.json or .vscode/mcp.json",
    supportedTransports: ["local", "remote"],
    repoInstructions: [
      "AGENTS.md",
      ".github/copilot-instructions.md",
      ".github/instructions/*.instructions.md",
    ],
    userInstructions: ["VS Code user instruction files"],
    workspaceHooks: [],
    userHooks: [],
    officialDocsUrl: "https://code.visualstudio.com/docs/copilot/customization/custom-instructions",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    supportTier: "supported",
    configFormat: "json-mcpServers",
    mcpConfig: "~/.codeium/mcp_config.json",
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", ".windsurf/rules/*"],
    userInstructions: ["~/.codeium/windsurf/memories/global_rules.md"],
    workspaceHooks: [".windsurf/hooks.json"],
    userHooks: ["~/.codeium/windsurf/hooks.json"],
    officialDocsUrl: "https://docs.windsurf.com/plugins/cascade/memories",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "codex-cli",
    name: "OpenAI Codex",
    supportTier: "validated",
    configFormat: "toml-codex",
    mcpConfig: "~/.codex/config.toml",
    supportedTransports: ["local"],
    repoInstructions: ["AGENTS.md"],
    userInstructions: [
      "$CODEX_HOME/AGENTS.md",
      "$CODEX_HOME/AGENTS.override.md",
      "model_instructions_file in ~/.codex/config.toml",
    ],
    workspaceHooks: [],
    userHooks: [],
    officialDocsUrl: "https://developers.openai.com/learn/docs-mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "opencode",
    name: "OpenCode",
    supportTier: "supported",
    configFormat: "json-opencode",
    mcpConfig: "~/.config/opencode/opencode.json or opencode.json",
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", "opencode.json[c] instructions"],
    userInstructions: [
      "~/.config/opencode/AGENTS.md",
      "~/.config/opencode/opencode.json[c] instructions",
    ],
    workspaceHooks: [],
    userHooks: [],
    officialDocsUrl: "https://open-code.ai/docs/en/config",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    mcpConfig: "~/.gemini/settings.json",
    supportedTransports: ["local", "remote"],
    repoInstructions: ["GEMINI.md", "AGENTS.md (if added to context.fileName)"],
    userInstructions: ["~/.gemini/GEMINI.md"],
    workspaceHooks: [".gemini/settings.json"],
    userHooks: ["~/.gemini/settings.json"],
    officialDocsUrl: "https://geminicli.com/docs/reference/configuration/",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "warp",
    name: "Warp",
    supportTier: "supported",
    configFormat: "json-mcpServers",
    mcpConfig: "~/.warp/mcp.json",
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md", "WARP.md (legacy)"],
    userInstructions: ["Warp global rules"],
    workspaceHooks: [],
    userHooks: [],
    officialDocsUrl: "https://docs.warp.dev/agent-platform/capabilities/rules",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    supportTier: "experimental",
    configFormat: "json-mcpServers",
    mcpConfig: "Experimental raw MCP config (client-managed)",
    supportedTransports: ["local", "remote"],
    repoInstructions: [],
    userInstructions: [],
    workspaceHooks: [],
    userHooks: [],
    officialDocsUrl: "https://antigravity.codes/blog/antigravity-mcp-tutorial",
    lastVerifiedAt: "2026-04-19",
  },
] as const

export function getRelayMcpClientDescriptor(id: RelayMcpClientId) {
  return RELAY_MCP_CLIENTS.find((client) => client.id === id) ?? null
}
