import * as p from "@clack/prompts"
import pc from "picocolors"

import {
  RelayApiClient,
  loadConfig,
  saveConfig,
  getConfigPath,
  detectIDEs,
  installMcpConfig,
  installClientSetup,
  validateInstalledMcpConfig,
  listProjects,
  printBanner,
  success,
  info,
  step,
  startAuthFlow,
  startScopedMcpAuthFlow,
} from "@relay/cli-core"
import { startUnifiedAuthFlow } from "./auth"
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

  // Step 1: CLI Auth
  p.intro(pc.bold("Let's connect your terminal to Relay"))

  step(options.openBrowser === false ? "Starting manual authorization..." : "Starting browser authorization...")
  const auth = await startAuthFlow(apiBase, { openBrowser: options.openBrowser })
  success("Authenticated successfully!")

  // Step 2: Resolve project for scoped token
  // Relay now auto-detects the active project from the cwd/git remote at
  // runtime (see packages/mcp/src/server.ts). We still need *a* project ID
  // for the scoped token exchange, but we don't ask the user — we pick one
  // silently (existing config first, then the most recently updated project)
  // and rely on the MCP server + set_current_project tool to switch per-cwd.
  let projectId = existing?.projectId
  const projectClient = new RelayApiClient(auth.apiBase, auth.token)
  const projects = await listProjects(projectClient)

  if (!projectId && projects.length > 0) {
    projectId = projects[0]?.id
  }

  // Step 3: Get scoped MCP token
  let accessToken: string | undefined
  let refreshToken: string | undefined
  let accessTokenExpiresAt: string | undefined
  let refreshTokenExpiresAt: string | undefined

  if (projectId) {
    // Try unified auth first, fall back to legacy two-step
    try {
      step("Requesting scoped MCP token (unified)...")
      const unifiedAuth = await startUnifiedAuthFlow(auth.apiBase, projectId, {
        openBrowser: options.openBrowser
      })
      accessToken = unifiedAuth.accessToken
      refreshToken = unifiedAuth.refreshToken
      accessTokenExpiresAt = unifiedAuth.accessExpiresAt
      refreshTokenExpiresAt = unifiedAuth.refreshExpiresAt
    } catch {
      // Fallback to legacy flow
      step("Requesting scoped MCP token...")
      const scopedAuth = await startScopedMcpAuthFlow(auth.apiBase, projectId, {
        openBrowser: options.openBrowser
      })
      accessToken = scopedAuth.accessToken
      refreshToken = scopedAuth.refreshToken
      accessTokenExpiresAt = scopedAuth.accessExpiresAt
      refreshTokenExpiresAt = scopedAuth.refreshExpiresAt
    }
    success("Scoped MCP access approved!")
  }

  // Step 4: Save config
  await saveConfig({
    apiBase: auth.apiBase,
    token: auth.token,
    projectId,
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  })
  success(`Config saved to ${pc.dim(getConfigPath())}`)

  // Step 5: Detect IDEs
  console.log()
  step("Detecting coding tools...")
  const ides = await detectIDEs()

  // Step 6: Install MCP configs and client-specific setup
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

        const setupPath = await installClientSetup(ide)
        if (setupPath) {
          success(`Client setup → ${pc.dim(setupPath)}`)
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
  console.log(pc.dim("  2. Your AI coding tool will auto-discover Relay MCP"))
  console.log(pc.dim("  3. Start by calling list_projects, then get_brief"))
  console.log()
}
