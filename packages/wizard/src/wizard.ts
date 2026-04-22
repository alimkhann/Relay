import * as p from "@clack/prompts"
import pc from "picocolors"

import {
  loadConfig,
  saveConfig,
  getConfigPath,
  detectIDEs,
  installMcpConfig,
  installClientSetup,
  validateInstalledClientSetup,
  validateInstalledMcpConfig,
  printBanner,
  success,
  info,
  warn,
  step,
  startUnifiedAuthFlow,
} from "@relay/cli-core"
import { runUninstall } from "./uninstall"

const DEFAULT_API_BASE = "https://www.onrelay.app"

export async function runWizardFlow(options: { apiBase?: string; openBrowser?: boolean } = {}) {
  printBanner()

  const apiBase = options.apiBase ?? process.env["RELAY_API_BASE"] ?? DEFAULT_API_BASE

  // Check for existing config
  const existing = await loadConfig()
  if (existing) {
    const action = await p.select({
      message: "Relay is already configured. What would you like to do?",
      options: [
        { value: "default", label: "Default setup (re-run wizard)" },
        { value: "reconfigure", label: "Reconfigure (fresh install)" },
        { value: "uninstall", label: "Uninstall Relay" }
      ]
    })

    if (p.isCancel(action)) return

    if (action === "uninstall") {
      await runUninstall()
      return
    }

    // For "reconfigure", we proceed with the full wizard flow
  }

  // Step 1: Unified auth
  p.intro(pc.bold("Let's connect Relay MCP to your coding tools"))

  step(options.openBrowser === false ? "Starting manual authorization..." : "Starting browser authorization...")
  const auth = await startUnifiedAuthFlow(apiBase, existing?.projectId, { openBrowser: options.openBrowser })
  success("Authenticated successfully!")

  if (!auth.accessToken) {
    warn("Relay could not mint a scoped MCP token yet. Create a project in Relay, then re-run the wizard.")
  } else {
    success("Scoped MCP access approved!")
  }

  // Step 2: Save config
  await saveConfig({
    apiBase: auth.apiBase,
    token: auth.token,
    projectId: auth.projectId ?? existing?.projectId,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    accessTokenExpiresAt: auth.accessExpiresAt,
    refreshTokenExpiresAt: auth.refreshExpiresAt,
  })
  success(`Config saved to ${pc.dim(getConfigPath())}`)

  // Step 3: Detect IDEs
  console.log()
  step("Detecting coding tools...")
  const ides = await detectIDEs()

  // Step 4: Install MCP configs and client-specific setup
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
        await installMcpConfig(ide, { mode: "local" })
        const isInstalled = await validateInstalledMcpConfig(ide)
        success(`${ide.name} (${ide.supportTier}) MCP config → ${pc.dim(ide.mcpConfigPath)}`)
        if (!isInstalled) {
          throw new Error(`Relay MCP install did not validate for ${ide.name}.`)
        }

        const setup = await installClientSetup(ide)
        if (setup.artifacts.length > 0) {
          const isSetupValid = await validateInstalledClientSetup(ide)
          if (!isSetupValid) {
            throw new Error(`Relay client setup did not validate for ${ide.name}.`)
          }
          for (const artifact of setup.artifacts) {
            const statusLabel = artifact.status === "already-configured" ? "already configured" : artifact.status
            success(`${ide.name} ${artifact.kind} (${statusLabel}) → ${pc.dim(artifact.path)}`)
          }
        }
      }
    }
  }

  // Done
  console.log()
  p.outro(pc.bold(pc.green("Relay is ready!")))
  console.log()
  info("Next steps:")
  console.log(pc.dim("  1. Open a new terminal session in your project"))
  console.log(pc.dim("  2. Your coding agent should load Relay MCP and its client-native guidance"))
  console.log(pc.dim("  3. Start with get_brief; only use list_projects if Relay reports ambiguity"))
  console.log()
}
