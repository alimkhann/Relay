import * as p from "@clack/prompts"
import pc from "picocolors"

import {
  type DetectedIDE,
  type InstallMcpConfigResult,
  buildManualMcpConfig,
  clearConfig,
  getAllClients,
  getConfigPath,
  info,
  installClientSetup,
  installMcpConfigDetailed,
  loadConfig,
  printBanner,
  RelayNodeAnalytics,
  saveConfig,
  startUnifiedAuthFlow,
  step,
  success,
  uninstallClientSetup,
  uninstallMcpConfig,
  validateInstalledClientSetup,
  validateInstalledMcpConfig,
  warn,
} from "@relay/cli-core"
import { runUninstall } from "./uninstall"

const DEFAULT_API_BASE = "https://www.onrelay.app"
const DEFAULT_REMOTE_MCP_URL = "https://www.onrelay.app/mcp"

type WizardMode = "default" | "advanced" | "manual" | "uninstall"
type InstallMode = "local" | "remote"

export interface WizardFlowOptions {
  apiBase?: string
  openBrowser?: boolean
  mode?: WizardMode
  installMode?: InstallMode
  ci?: boolean
  remoteUrl?: string
}

const analytics = new RelayNodeAnalytics({
  app: "wizard",
  appSource: "relay-wizard",
  anonymousPrefix: "relay-wizard",
})

function isCancelled(value: unknown) {
  return p.isCancel(value)
}

function describeClient(ide: DetectedIDE) {
  const detected = ide.detected ? "detected" : "not detected"
  const layers = ide.defaultInstallLayers.join("+") || "mcp"
  return `${ide.name} (${detected}, ${ide.supportTier}, ${layers})`
}

function groupResults(results: InstallMcpConfigResult[]) {
  const groups = new Map<InstallMcpConfigResult["status"], InstallMcpConfigResult[]>()
  for (const result of results) {
    groups.set(result.status, [...(groups.get(result.status) ?? []), result])
  }
  return groups
}

function printInstallSummary(results: InstallMcpConfigResult[]) {
  const groups = groupResults(results)
  for (const status of ["installed", "updated", "already-configured", "skipped", "failed"] as const) {
    const entries = groups.get(status) ?? []
    if (entries.length === 0) continue
    const color = status === "failed" ? pc.red : status === "skipped" ? pc.yellow : pc.green
    console.log(color(`${status}: ${entries.map((entry) => entry.clientName).join(", ")}`))
    for (const entry of entries) {
      const detail = entry.path ?? entry.command ?? entry.message
      console.log(pc.dim(`  - ${entry.clientName}: ${detail}`))
      if (entry.error) console.log(pc.dim(`    ${entry.error}`))
    }
  }
}

function printManualConfig(ide: DetectedIDE, apiBase: string, remoteUrl: string) {
  console.log()
  info(pc.bold(`Manual setup for ${ide.name}`))
  console.log(pc.dim(`Docs: ${ide.officialDocsUrl}`))
  console.log(pc.dim(`Config path: ${ide.mcpConfigPath}`))
  console.log(pc.dim(`Server key: ${ide.serverPropertyPath.join(".") || "mcpServers"}.relay`))
  console.log(pc.dim(`Notes: ${ide.manualSetupNotes}`))
  console.log()
  console.log(pc.cyan("Local stdio config:"))
  console.log(JSON.stringify({ relay: buildManualMcpConfig(ide, { mode: "local" }) }, null, 2))

  if (ide.supportedTransports.includes("remote")) {
    console.log()
    console.log(pc.cyan("Remote HTTP config:"))
    try {
      console.log(JSON.stringify({
        relay: buildManualMcpConfig(ide, {
          mode: "remote",
          remoteUrl,
          bearerToken: "RELAY_MCP_TOKEN",
        }),
      }, null, 2))
    } catch (error) {
      console.log(pc.dim(error instanceof Error ? error.message : "Remote config is unavailable for this client."))
    }
  }
  console.log(pc.dim(`Relay auth config is stored separately in ${getConfigPath()} for local stdio installs against ${apiBase}.`))
}

async function chooseWizardMode(existing: Awaited<ReturnType<typeof loadConfig>>, requested?: WizardMode): Promise<WizardMode | null> {
  if (requested) return requested
  if (!existing) return "default"

  const action = await p.select({
    message: "Relay is already configured. What would you like to do?",
    options: [
      { value: "default", label: "Default setup (update clients)" },
      { value: "advanced", label: "Advanced setup" },
      { value: "manual", label: "Manual setup (view config)" },
      { value: "uninstall", label: "Uninstall Relay" },
    ],
  })
  if (isCancelled(action)) return null
  return action as WizardMode
}

async function chooseInstallMode(options: WizardFlowOptions): Promise<InstallMode | null> {
  if (options.installMode) return options.installMode
  if (options.ci) return "local"
  const mode = await p.select({
    message: "Choose MCP transport:",
    options: [
      { value: "local", label: "Local stdio (recommended)" },
      { value: "remote", label: "Remote HTTP (advanced)" },
    ],
    initialValue: "local",
  })
  if (isCancelled(mode)) return null
  return mode as InstallMode
}

async function selectClients(clients: DetectedIDE[], options: WizardFlowOptions, installMode: InstallMode) {
  const installable = clients.filter((client) => installMode === "local" || client.supportedTransports.includes("remote"))
  if (installable.length === 0) {
    info("No supported MCP clients are available. Use manual setup mode to view config examples.")
    return []
  }
  if (options.ci) {
    return installable.filter((client) => client.detected === true && client.installMethod !== "manual")
  }

  const selected = await p.multiselect({
    message: "Install Relay MCP for:",
    options: installable.map((client) => ({
      value: client.id,
      label: describeClient(client),
      hint: client.detected ? undefined : "not detected - manual config is still available",
    })) as Array<{ value: string; label: string; hint?: string }>,
    initialValues: installable
      .filter((client) => client.detected === true && client.installMethod !== "manual")
      .map((client) => client.id),
    required: false,
  })
  if (isCancelled(selected)) return null
  const selectedIds = selected as string[]
  return installable.filter((client) => selectedIds.includes(client.id))
}

async function maybeSkipInstalledClients(clients: DetectedIDE[], options: WizardFlowOptions) {
  const installed: DetectedIDE[] = []
  for (const client of clients) {
    if (client.installMethod !== "manual" && await validateInstalledMcpConfig(client)) installed.push(client)
  }
  if (installed.length === 0 || options.ci) return clients

  warn(`Relay is already configured for: ${installed.map((client) => client.name).join(", ")}`)
  const reinstall = await p.confirm({
    message: "Update or repair existing Relay MCP entries?",
    initialValue: true,
  })
  if (isCancelled(reinstall)) return null
  if (reinstall) return clients
  return clients.filter((client) => !installed.includes(client))
}

async function runManualMode(clients: DetectedIDE[], apiBase: string, remoteUrl: string) {
  const selectedId = await p.select({
    message: "Select a coding tool to view manual setup:",
    options: clients.map((client) => ({
      value: client.id,
      label: describeClient(client),
    })) as Array<{ value: string; label: string }>,
  })
  if (isCancelled(selectedId)) return
  const client = clients.find((candidate) => candidate.id === selectedId)
  if (client) printManualConfig(client, apiBase, remoteUrl)
}

async function runUninstallMode(clients: DetectedIDE[], options: WizardFlowOptions) {
  const installed: DetectedIDE[] = []
  for (const client of clients) {
    if (await validateInstalledMcpConfig(client)) installed.push(client)
  }

  if (installed.length === 0) {
    if (options.ci) {
      await clearConfig()
      success("Cleared local Relay credentials. No installed MCP entries were detected.")
      return
    }
    await runUninstall()
    return
  }

  const selected = options.ci
    ? installed.map((client) => client.id)
    : await p.multiselect({
        message: "Remove Relay from:",
        options: installed.map((client) => ({ value: client.id, label: client.name })) as Array<{ value: string; label: string }>,
        initialValues: installed.map((client) => client.id),
        required: false,
      })
  if (isCancelled(selected)) return

  const selectedIds = selected as string[]
  let removed = 0
  for (const client of installed.filter((candidate) => selectedIds.includes(candidate.id))) {
    const removedMcp = await uninstallMcpConfig(client)
    const removedSetup = await uninstallClientSetup(client)
    if (removedMcp || removedSetup) removed += 1
  }
  await clearConfig()
  success(`Removed Relay from ${removed} client${removed === 1 ? "" : "s"} and cleared local credentials.`)
}

export async function runWizardFlow(
  options: WizardFlowOptions = {},
  analyticsClient: Pick<RelayNodeAnalytics, "capture" | "captureException" | "identify" | "shutdown"> = analytics,
) {
  printBanner()
  analyticsClient.capture("wizard_started", {
    success: true,
    open_browser: options.openBrowser !== false,
    mode: options.mode ?? "default",
  })

  const apiBase = options.apiBase ?? process.env["RELAY_API_BASE"] ?? DEFAULT_API_BASE
  const remoteUrl = options.remoteUrl ?? process.env["RELAY_REMOTE_MCP_URL"] ?? DEFAULT_REMOTE_MCP_URL
  const existing = await loadConfig()
  const mode = await chooseWizardMode(existing, options.mode)
  if (!mode) return

  p.intro(pc.bold("Let's connect Relay MCP to your coding tools"))
  console.log()
  step("Loading coding tool catalog...")
  const clients = await getAllClients()

  if (mode === "manual") {
    await runManualMode(clients, apiBase, remoteUrl)
    analyticsClient.capture("wizard_completed", { success: true, mode: "manual", project_id: existing?.projectId ?? null })
    await analyticsClient.shutdown()
    return
  }

  if (mode === "uninstall") {
    await runUninstallMode(clients, options)
    analyticsClient.capture("wizard_completed", { success: true, mode: "uninstall", project_id: existing?.projectId ?? null })
    await analyticsClient.shutdown()
    return
  }

  const installMode = mode === "advanced" ? await chooseInstallMode(options) : (options.installMode ?? "local")
  if (!installMode) return

  step(options.openBrowser === false ? "Starting manual authorization..." : "Starting browser authorization...")
  let auth
  try {
    auth = await startUnifiedAuthFlow(apiBase, existing?.projectId, { openBrowser: options.openBrowser })
    await analyticsClient.identify(auth.apiBase, auth.token)
    analyticsClient.capture("wizard_auth_completed", {
      success: true,
      project_id: auth.projectId ?? existing?.projectId ?? null,
    })
    success("Authenticated successfully!")
  } catch (error) {
    analyticsClient.capture("wizard_auth_failed", {
      success: false,
      project_id: existing?.projectId ?? null,
    })
    analyticsClient.capture("wizard_failed", {
      success: false,
      stage: "auth",
    } as Record<string, string | number | boolean | null>)
    throw error
  }

  if (!auth.accessToken) {
    warn("Relay could not mint a scoped MCP token yet. Create a project in Relay, then re-run the wizard.")
  } else {
    success("Scoped MCP access approved!")
  }

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

  const selected = await selectClients(clients, options, installMode)
  if (!selected) return
  const clientsToInstall = await maybeSkipInstalledClients(selected, options)
  if (!clientsToInstall) return

  const results: InstallMcpConfigResult[] = []
  for (const client of clientsToInstall) {
    try {
      const result = await installMcpConfigDetailed(client, {
        mode: installMode,
        remoteUrl,
        bearerToken: auth.accessToken ?? auth.token,
      })
      results.push(result)

      if (result.status !== "failed" && result.status !== "skipped") {
        const setup = await installClientSetup(client)
        if (setup.artifacts.length > 0 && !(await validateInstalledClientSetup(client))) {
          warn(`Relay behavior setup did not validate for ${client.name}. MCP config was still installed.`)
        }
        for (const artifact of setup.artifacts) {
          const statusLabel = artifact.status === "already-configured" ? "already configured" : artifact.status
          success(`${client.name} ${artifact.kind} (${statusLabel}) -> ${pc.dim(artifact.path)}`)
        }
      }

      analyticsClient.capture("wizard_client_configured", {
        success: result.status !== "failed",
        client_name: client.id,
        support_tier: client.supportTier,
        status: result.status,
        method: result.method,
      } as Record<string, string | number | boolean | null>)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "failed",
        method: client.installMethod === "manual" ? "manual" : "config",
        path: client.mcpConfigPath,
        command: null,
        message,
        error: message,
      })
      analyticsClient.capture("wizard_client_configured", {
        success: false,
        client_name: client.id,
        support_tier: client.supportTier,
        status: "failed",
      } as Record<string, string | number | boolean | null>)
    }
  }

  console.log()
  printInstallSummary(results)
  console.log()
  p.outro(pc.bold(pc.green("Relay wizard finished")))
  console.log()
  info("Next steps:")
  console.log(pc.dim("  1. Restart any coding tools that cache MCP configuration"))
  console.log(pc.dim("  2. Start with get_brief; only use list_projects if Relay reports ambiguity"))
  console.log(pc.dim("  3. Use manual setup mode for clients listed as skipped"))
  console.log()

  analyticsClient.capture("wizard_completed", {
    success: results.every((result) => result.status !== "failed"),
    mode,
    install_mode: installMode,
    project_id: auth.projectId ?? existing?.projectId ?? null,
  })
  await analyticsClient.shutdown()
}
