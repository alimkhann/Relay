import * as p from "@clack/prompts"
import pc from "picocolors"

import { startAuthFlow } from "./auth"
import { loadConfig, saveConfig, getConfigPath } from "./config"
import { detectIDEs } from "./detect"
import { installMcpConfig } from "./install-mcp"
import { installSkillFile, installUniversalSkillFile } from "./install-skill"
import { printBanner, success, info, step } from "./ui"

const DEFAULT_API_BASE = "https://relay-flow.vercel.app"

export async function runWizard(options: { apiBase?: string } = {}) {
  printBanner()

  const apiBase = options.apiBase ?? process.env["RELAY_API_BASE"] ?? DEFAULT_API_BASE

  // Check for existing config
  const existing = await loadConfig()
  if (existing) {
    const shouldReconfigure = await p.confirm({
      message: "Relay is already configured. Reconfigure?",
      initialValue: false
    })

    if (p.isCancel(shouldReconfigure) || !shouldReconfigure) {
      info("Keeping existing configuration.")
      return
    }
  }

  // Auth
  p.intro(pc.bold("Let's connect your terminal to Relay"))

  step("Starting browser authorization...")
  const auth = await startAuthFlow(apiBase)
  success("Authenticated successfully!")

  // Save config
  await saveConfig({ apiBase: auth.apiBase, token: auth.token })
  success(`Config saved to ${pc.dim(getConfigPath())}`)

  // Detect IDEs
  console.log()
  step("Detecting coding tools...")
  const ides = await detectIDEs()

  if (ides.length === 0) {
    info("No supported IDEs detected. You can configure MCP manually.")
  } else {
    const ideChoices = ides.map((ide) => ({
      value: ide.id,
      label: ide.name
    }))

    const selectedIdeIds = await p.multiselect({
      message: "Install Relay MCP for:",
      options: ideChoices,
      initialValues: ideChoices.map((c) => c.value),
      required: false
    })

    if (!p.isCancel(selectedIdeIds)) {
      const selectedIdes = ides.filter((ide) => (selectedIdeIds as string[]).includes(ide.id))

      for (const ide of selectedIdes) {
        await installMcpConfig(ide)
        success(`MCP config → ${pc.dim(ide.mcpConfigPath)}`)

        const skillPath = await installSkillFile(ide)
        if (skillPath) {
          success(`Skill file → ${pc.dim(skillPath)}`)
        }
      }
    }
  }

  // Universal skill file
  const universalPath = await installUniversalSkillFile()
  success(`Universal skill file → ${pc.dim(universalPath)}`)

  // Done
  console.log()
  p.outro(pc.bold(pc.green("Relay is ready!")))
  console.log()
  info("Next steps:")
  console.log(pc.dim("  1. Open a new terminal session in your project"))
  console.log(pc.dim("  2. Your AI coding tool will auto-discover Relay MCP"))
  console.log(pc.dim(`  3. Try: "load my project context from Relay"`))
  console.log()
}
