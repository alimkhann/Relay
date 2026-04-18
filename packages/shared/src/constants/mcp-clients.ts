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
export type RelayMcpInstructionSurface =
  | "none"
  | "hooks"
  | "rules"
  | "agents_md"
  | "project_instructions"
  | "instructions"
  | "experimental"

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
  configPathLabel: string
  supportedTransports: readonly RelayMcpTransportMode[]
  instructionSurface: RelayMcpInstructionSurface
  instructionPathLabel: string | null
  officialDocsUrl: string
  lastVerifiedAt: string
}

export const RELAY_MCP_CLIENTS: readonly RelayMcpClientDescriptor[] = [
  {
    id: "claude",
    name: "Claude Code",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    configPathLabel: "~/.claude.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "hooks",
    instructionPathLabel: "~/.claude/settings.json",
    officialDocsUrl: "https://code.claude.com/docs/en/mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    configPathLabel: "claude_desktop_config.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "none",
    instructionPathLabel: null,
    officialDocsUrl: "https://code.claude.com/docs/en/mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "cursor-project",
    name: "Cursor (project)",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    configPathLabel: ".cursor/mcp.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "rules",
    instructionPathLabel: ".cursor/rules",
    officialDocsUrl: "https://docs.cursor.com/context/model-context-protocol",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "cursor-global",
    name: "Cursor (global)",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    configPathLabel: "~/.cursor/mcp.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "agents_md",
    instructionPathLabel: "AGENTS.md or Cursor user rules",
    officialDocsUrl: "https://docs.cursor.com/context/model-context-protocol",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "vscode",
    name: "VS Code",
    supportTier: "supported",
    configFormat: "json-servers",
    configPathLabel: "User mcp.json or .vscode/mcp.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "agents_md",
    instructionPathLabel: "AGENTS.md",
    officialDocsUrl: "https://code.visualstudio.com/updates/v1_102",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    supportTier: "supported",
    configFormat: "json-mcpServers",
    configPathLabel: "~/.codeium/mcp_config.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "rules",
    instructionPathLabel: ".windsurfrules or project rules",
    officialDocsUrl: "https://docs.windsurf.com/plugins/cascade/mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "codex-cli",
    name: "OpenAI Codex",
    supportTier: "validated",
    configFormat: "toml-codex",
    configPathLabel: "~/.codex/config.toml",
    supportedTransports: ["local"],
    instructionSurface: "agents_md",
    instructionPathLabel: "AGENTS.md",
    officialDocsUrl: "https://developers.openai.com/learn/docs-mcp",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "opencode",
    name: "OpenCode",
    supportTier: "supported",
    configFormat: "json-opencode",
    configPathLabel: "~/.config/opencode/opencode.json or opencode.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "instructions",
    instructionPathLabel: "opencode.json instructions",
    officialDocsUrl: "https://opencode.ai/docs/config",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    supportTier: "validated",
    configFormat: "json-mcpServers",
    configPathLabel: "~/.gemini/settings.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "none",
    instructionPathLabel: null,
    officialDocsUrl: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "warp",
    name: "Warp",
    supportTier: "supported",
    configFormat: "json-mcpServers",
    configPathLabel: "~/.warp/mcp.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "project_instructions",
    instructionPathLabel: "WARP.md",
    officialDocsUrl: "https://docs.warp.dev/knowledge-and-collaboration/rules",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    supportTier: "experimental",
    configFormat: "json-mcpServers",
    configPathLabel: "~/.antigravity/mcp.json",
    supportedTransports: ["local", "remote"],
    instructionSurface: "experimental",
    instructionPathLabel: null,
    officialDocsUrl: "https://github.com/mcp/io.github.upstash/context7",
    lastVerifiedAt: "2026-04-19",
  },
] as const

export function getRelayMcpClientDescriptor(id: RelayMcpClientId) {
  return RELAY_MCP_CLIENTS.find((client) => client.id === id) ?? null
}
