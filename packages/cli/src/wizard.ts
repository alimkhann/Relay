import * as p from "@clack/prompts"
import pc from "picocolors"

import type { RelayCliAnalytics } from "./analytics"
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

const DEFAULT_API_BASE = "https://www.onrelay.app"

export async function runWizard(options: { apiBase?: string; analytics?: RelayCliAnalytics; openBrowser?: boolean } = {}) {
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

  // Unified auth
  p.intro(pc.bold("Let's connect Relay MCP to your coding tools"))

  step(options.openBrowser === false ? "Starting manual authorization..." : "Starting browser authorization...")
  let auth
  try {
    auth = await startUnifiedAuthFlow(apiBase, existing?.projectId, { openBrowser: options.openBrowser })
    await options.analytics?.identify(auth.apiBase, auth.token)
    options.analytics?.capture("wizard_auth_completed", {
      success: true,
      project_id: auth.projectId ?? existing?.projectId ?? null,
    })
    success("Authenticated successfully!")
  } catch (error) {
    options.analytics?.capture("wizard_auth_failed", {
      success: false,
      project_id: existing?.projectId ?? null,
    })
    options.analytics?.capture("cli_install_failed", {
      success: false,
      project_id: existing?.projectId ?? null,
    })
    throw error
  }

  if (!auth.accessToken) {
    warn("Relay could not mint a scoped MCP token yet. Create a project in Relay, then re-run the installer.")
  } else {
    success("Scoped MCP access approved!")
  }

  // Save config
  await saveConfig({
    apiBase: auth.apiBase,
    token: auth.token,
    projectId: auth.projectId ?? existing?.projectId,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    accessTokenExpiresAt: auth.accessExpiresAt,
    refreshTokenExpiresAt: auth.refreshExpiresAt,
  })
  options.analytics?.capture("cli_install_completed", {
    success: true,
    project_id: auth.projectId ?? existing?.projectId ?? null,
  })
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
