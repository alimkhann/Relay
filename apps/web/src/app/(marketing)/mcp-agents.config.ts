export interface McpAgent {
  name: string
  url?: string
  tier?: "primary" | "secondary"
}

export const MCP_AGENTS: McpAgent[] = [
  { name: "Claude Code", tier: "primary" },
  { name: "Cursor", tier: "primary" },
  { name: "Codex", tier: "primary" },
  { name: "Windsurf", tier: "primary" },
  { name: "OpenCode", tier: "primary" },
  { name: "Gemini CLI", tier: "primary" },
  { name: "VS Code (Copilot)", tier: "secondary" },
  { name: "Trae", tier: "secondary" },
  { name: "Antigravity", tier: "secondary" },
  { name: "Zed", tier: "secondary" },
  { name: "Continue", tier: "secondary" },
  { name: "Aider", tier: "secondary" },
  { name: "Amp", tier: "secondary" },
  { name: "Void", tier: "secondary" },
  { name: "Cline", tier: "secondary" },
  { name: "Roo Code", tier: "secondary" },
  { name: "Augment", tier: "secondary" },
  { name: "Kilo Code", tier: "secondary" },
  { name: "Copilot (CLI)", tier: "secondary" },
  { name: "Amazon Q", tier: "secondary" },
]
