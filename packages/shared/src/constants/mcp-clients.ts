export type RelayMcpClientId =
  | "claude"
  | "claude-desktop"
  | "cursor-project"
  | "cursor-global"
  | "vscode"
  | "windsurf"
  | "cline"
  | "continue"
  | "zed"
  | "jetbrains"
  | "codex-cli"
  | "codex-app"
  | "opencode"
  | "gemini-cli"
  | "qodo-gen"
  | "qwen-coder"
  | "visual-studio"
  | "crush"
  | "copilot-cli"
  | "copilot-agent"
  | "augment"
  | "kiro"
  | "lm-studio"
  | "bolt-ai"
  | "perplexity"
  | "warp"
  | "amazon-q"
  | "factory"
  | "amp"
  | "vibe"
  | "roo-code"
  | "kilo-code"
  | "trae"
  | "antigravity"

export type RelayMcpSupportTier = "validated" | "supported" | "experimental"
export type RelayMcpTransportMode = "local" | "remote"
export type RelayMcpInstallLayer = "mcp" | "instructions" | "rules" | "hooks" | "skills"
export type RelayMcpInstallScope = "user" | "workspace"
export type RelayMcpInstallMethod = "config" | "cli" | "cli-with-config-fallback" | "manual"

export type RelayMcpConfigFormat =
  | "json-mcpServers"
  | "json-servers"
  | "json-opencode"
  | "toml-codex"
  | "manual"

export interface RelayMcpClientDescriptor {
  id: RelayMcpClientId
  name: string
  supportTier: RelayMcpSupportTier
  configFormat: RelayMcpConfigFormat
  installMethod: RelayMcpInstallMethod
  mcpConfig: string
  serverPropertyPath: readonly string[]
  binaryNames: readonly string[]
  manualSetupNotes: string
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
    installMethod: "cli-with-config-fallback",
    mcpConfig: "~/.claude.json",
    serverPropertyPath: ["mcpServers"],
    binaryNames: ["claude"],
    manualSetupNotes: "Claude Code can be configured with `claude mcp add` or by editing ~/.claude.json.",
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
    installMethod: "config",
    mcpConfig: "claude_desktop_config.json",
    serverPropertyPath: ["mcpServers"],
    binaryNames: [],
    manualSetupNotes: "Claude Desktop reads MCP servers from its application support config file.",
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
    installMethod: "config",
    mcpConfig: ".cursor/mcp.json",
    serverPropertyPath: ["mcpServers"],
    binaryNames: [],
    manualSetupNotes: "Project-scoped Cursor MCP config lives in .cursor/mcp.json.",
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
    installMethod: "config",
    mcpConfig: "~/.cursor/mcp.json",
    serverPropertyPath: ["mcpServers"],
    binaryNames: [],
    manualSetupNotes: "Global Cursor MCP config lives in ~/.cursor/mcp.json.",
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
    installMethod: "config",
    mcpConfig: "User mcp.json or .vscode/mcp.json",
    serverPropertyPath: ["servers"],
    binaryNames: ["code"],
    manualSetupNotes: "VS Code MCP servers use the `servers` key in the user or workspace mcp.json file.",
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
    installMethod: "config",
    mcpConfig: "~/.codeium/mcp_config.json",
    serverPropertyPath: ["mcpServers"],
    binaryNames: ["windsurf"],
    manualSetupNotes: "Windsurf MCP config is installed globally; Relay rules are project-scoped.",
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
    installMethod: "cli-with-config-fallback",
    mcpConfig: "~/.codex/config.toml",
    serverPropertyPath: ["mcp_servers"],
    binaryNames: ["codex"],
    manualSetupNotes: "Codex prefers `codex mcp add` when available; config fallback writes ~/.codex/config.toml.",
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
    installMethod: "config",
    mcpConfig: "~/.config/opencode/opencode.json or opencode.json",
    serverPropertyPath: ["mcp"],
    binaryNames: ["opencode"],
    manualSetupNotes: "OpenCode uses an `mcp` object and supports project or user config.",
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
    installMethod: "config",
    mcpConfig: "~/.gemini/settings.json",
    serverPropertyPath: ["mcpServers"],
    binaryNames: ["gemini"],
    manualSetupNotes: "Gemini CLI MCP config and Relay hooks live in settings.json.",
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
    installMethod: "config",
    mcpConfig: "~/.warp/mcp.json",
    serverPropertyPath: ["mcpServers"],
    binaryNames: ["warp"],
    manualSetupNotes: "Warp uses a user-level MCP config; Relay does not install hooks for Warp.",
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
    installMethod: "manual",
    mcpConfig: "Experimental raw MCP config (client-managed)",
    serverPropertyPath: ["mcpServers"],
    binaryNames: [],
    manualSetupNotes: "Antigravity support is experimental; use manual setup unless a local config path is detected.",
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

const BROAD_MCP_CLIENTS: readonly RelayMcpClientDescriptor[] = [
  {
    id: "cline",
    name: "Cline",
    supportTier: "experimental",
    configFormat: "json-mcpServers",
    installMethod: "config",
    mcpConfig: "Cline MCP settings",
    serverPropertyPath: ["mcpServers"],
    binaryNames: [],
    manualSetupNotes: "Cline-compatible tools usually consume VS Code extension MCP settings.",
    mcpScopes: ["user"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md"],
    userInstructions: [],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["AGENTS.md"],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp"],
    officialDocsUrl: "https://cline.bot/",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "continue",
    name: "Continue",
    supportTier: "experimental",
    configFormat: "json-mcpServers",
    installMethod: "manual",
    mcpConfig: "Continue assistant config",
    serverPropertyPath: ["mcpServers"],
    binaryNames: [],
    manualSetupNotes: "Continue MCP support varies by version; show manual config first.",
    mcpScopes: ["user", "workspace"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md"],
    userInstructions: [],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["AGENTS.md"],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp"],
    officialDocsUrl: "https://docs.continue.dev/",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "zed",
    name: "Zed",
    supportTier: "experimental",
    configFormat: "manual",
    installMethod: "manual",
    mcpConfig: "~/.config/zed/settings.json",
    serverPropertyPath: ["context_servers"],
    binaryNames: ["zed"],
    manualSetupNotes: "Zed uses context server settings; Relay provides manual config if automatic validation fails.",
    mcpScopes: ["user"],
    supportedTransports: ["local"],
    repoInstructions: ["AGENTS.md"],
    userInstructions: [],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["AGENTS.md"],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp"],
    officialDocsUrl: "https://zed.dev/docs/assistant/model-context-protocol",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "jetbrains",
    name: "JetBrains",
    supportTier: "experimental",
    configFormat: "manual",
    installMethod: "manual",
    mcpConfig: "JetBrains AI Assistant MCP settings",
    serverPropertyPath: ["mcpServers"],
    binaryNames: [],
    manualSetupNotes: "JetBrains configuration is product/version dependent; Relay only prints manual setup.",
    mcpScopes: ["user"],
    supportedTransports: ["local", "remote"],
    repoInstructions: ["AGENTS.md"],
    userInstructions: [],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["AGENTS.md"],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: [],
    defaultInstallLayers: ["mcp"],
    officialDocsUrl: "https://www.jetbrains.com/ai/",
    lastVerifiedAt: "2026-04-19",
  },
  {
    id: "codex-app",
    name: "Codex App",
    supportTier: "experimental",
    configFormat: "toml-codex",
    installMethod: "cli-with-config-fallback",
    mcpConfig: "~/.codex/config.toml",
    serverPropertyPath: ["mcp_servers"],
    binaryNames: ["codex"],
    manualSetupNotes: "Codex App currently shares the Codex CLI MCP config path.",
    mcpScopes: ["user"],
    supportedTransports: ["local"],
    repoInstructions: ["AGENTS.md"],
    userInstructions: ["$CODEX_HOME/AGENTS.md"],
    workspaceHooks: [],
    userHooks: [],
    instructionSurfaces: ["AGENTS.md", "$CODEX_HOME/AGENTS.md"],
    ruleSurfaces: [],
    hookSurfaces: [],
    skillSurfaces: ["$CODEX_HOME/skills/*/SKILL.md"],
    defaultInstallLayers: ["mcp", "instructions"],
    officialDocsUrl: "https://developers.openai.com/learn/docs-mcp",
    lastVerifiedAt: "2026-04-19",
  },
  ...([
    ["qodo-gen", "Qodo Gen", "qodo", "Qodo Gen MCP settings"],
    ["qwen-coder", "Qwen Coder", "qwen", "Qwen Coder MCP settings"],
    ["visual-studio", "Visual Studio", "devenv", "Visual Studio MCP settings"],
    ["crush", "Crush", "crush", "Crush MCP settings"],
    ["copilot-cli", "GitHub Copilot CLI", "gh", "GitHub Copilot CLI MCP settings"],
    ["copilot-agent", "GitHub Copilot Agent", "gh", "GitHub Copilot Agent MCP settings"],
    ["augment", "Augment", "augment", "Augment MCP settings"],
    ["kiro", "Kiro", "kiro", "Kiro MCP settings"],
    ["lm-studio", "LM Studio", "lms", "LM Studio MCP settings"],
    ["bolt-ai", "BoltAI", "boltai", "BoltAI MCP settings"],
    ["perplexity", "Perplexity", "perplexity", "Perplexity MCP settings"],
    ["amazon-q", "Amazon Q", "q", "Amazon Q MCP settings"],
    ["factory", "Factory", "droid", "Factory Droid MCP settings"],
    ["amp", "Amp", "amp", "Amp MCP settings"],
    ["vibe", "Vibe", "vibe", "Vibe MCP settings"],
    ["roo-code", "Roo Code", "", "Roo Code MCP settings"],
    ["kilo-code", "Kilo Code", "", "Kilo Code MCP settings"],
    ["trae", "Trae", "trae", "Trae MCP settings"],
  ] satisfies ReadonlyArray<readonly [RelayMcpClientId, string, string, string]>).map(([id, name, binary, config]) => ({
    id,
    name,
    supportTier: "experimental" as const,
    configFormat: "manual" as const,
    installMethod: "manual" as const,
    mcpConfig: config,
    serverPropertyPath: ["mcpServers"],
    binaryNames: binary ? [binary] : [],
    manualSetupNotes: `${name} support is cataloged for manual setup until Relay verifies the native config format.`,
    mcpScopes: ["user"] as const,
    supportedTransports: ["local", "remote"] as const,
    repoInstructions: ["AGENTS.md"] as const,
    userInstructions: [] as const,
    workspaceHooks: [] as const,
    userHooks: [] as const,
    instructionSurfaces: ["AGENTS.md"] as const,
    ruleSurfaces: [] as const,
    hookSurfaces: [] as const,
    skillSurfaces: [] as const,
    defaultInstallLayers: ["mcp"] as const,
    officialDocsUrl: "https://modelcontextprotocol.io/",
    lastVerifiedAt: "2026-04-19",
  })),
]

export const RELAY_MCP_CLIENT_CATALOG: readonly RelayMcpClientDescriptor[] = [
  ...RELAY_MCP_CLIENTS,
  ...BROAD_MCP_CLIENTS,
]

export function getRelayMcpClientDescriptor(id: RelayMcpClientId) {
  return RELAY_MCP_CLIENT_CATALOG.find((client) => client.id === id) ?? null
}
