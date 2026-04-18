import * as p from "@clack/prompts"
import pc from "picocolors"

import type { RelayCliAnalytics } from "./analytics"
import {
  startAuthFlow,
  startScopedMcpAuthFlow,
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
  step
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

  // Auth
  p.intro(pc.bold("Let's connect your terminal to Relay"))

  step(options.openBrowser === false ? "Starting manual authorization..." : "Starting browser authorization...")
  const auth = await startAuthFlow(apiBase, { openBrowser: options.openBrowser })
  await options.analytics?.identify(auth.apiBase, auth.token)
  success("Authenticated successfully!")

  let projectId = existing?.projectId
  const projectClient = new RelayApiClient(auth.apiBase, auth.token)
  const projects = await listProjects(projectClient)

  if (projects.length > 0) {
    const selectedProjectId = await p.select({
      message: "Choose the active Relay project for MCP access:",
      options: projects.map((project) => ({
        value: project.id,
        label: project.name,
        hint: project.slug
      })),
      initialValue: projectId ?? projects[0]?.id
    })

    if (!p.isCancel(selectedProjectId)) {
      projectId = selectedProjectId as string
    }
  }

  let accessToken: string | undefined
  let refreshToken: string | undefined
  let accessTokenExpiresAt: string | undefined
  let refreshTokenExpiresAt: string | undefined

  if (projectId) {
    step("Requesting scoped MCP token...")
    const scopedAuth = await startScopedMcpAuthFlow(auth.apiBase, projectId, {
      openBrowser: options.openBrowser
    })
    accessToken = scopedAuth.accessToken
    refreshToken = scopedAuth.refreshToken
    accessTokenExpiresAt = scopedAuth.accessExpiresAt
    refreshTokenExpiresAt = scopedAuth.refreshExpiresAt
    success("Scoped MCP access approved!")
  }

  // Save config
  await saveConfig({
    apiBase: auth.apiBase,
    token: auth.token,
    projectId,
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  })
  options.analytics?.capture("cli_install_completed", {
    success: true,
    project_id: projectId ?? null,
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
