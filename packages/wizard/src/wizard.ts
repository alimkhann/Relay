import * as p from "@clack/prompts"
import pc from "picocolors"

import {
  RelayApiClient,
  loadConfig,
  saveConfig,
  getConfigPath,
  detectIDEs,
  installMcpConfig,
  installSkillFile,
  installUniversalSkillFile,
  listProjects,
  printBanner,
  success,
  info,
  step,
  startAuthFlow,
  startScopedMcpAuthFlow,
  type DetectedIDE,
} from "@relay/cli-core"
import { startUnifiedAuthFlow } from "./auth"
import { runUninstall } from "./uninstall"

const DEFAULT_API_BASE = "https://onrelay.app"

interface McpConfig {
  mcpServers?: Record<string, {
    command?: string
    args?: string[]
    url?: string
    headers?: Record<string, string>
  }>
}

async function installMcpConfigWithMode(
  ide: DetectedIDE,
  mode: "local" | "remote",
  remoteUrl?: string,
  bearerToken?: string
): Promise<void> {
  if (mode === "local") {
    await installMcpConfig(ide)
    return
  }

  // Remote HTTP MCP config
  const { readFile, writeFile, mkdir } = await import("node:fs/promises")
  const { dirname } = await import("node:path")

  let existing: McpConfig = {}
  try {
    const raw = await readFile(ide.mcpConfigPath, "utf-8")
    existing = JSON.parse(raw) as McpConfig
  } catch {
    // New file
  }

  existing.mcpServers = existing.mcpServers ?? {}
  existing.mcpServers["relay"] = {
    url: remoteUrl!,
    headers: { Authorization: `Bearer ${bearerToken!}` }
  }

  await mkdir(dirname(ide.mcpConfigPath), { recursive: true })
  await writeFile(ide.mcpConfigPath, JSON.stringify(existing, null, 2) + "\n", "utf-8")
}

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

  // Step 2: Pick project
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

  // Step 6: MCP transport mode
  let mcpMode: "local" | "remote" = "local"
  const remoteUrl = `${auth.apiBase}/api/mcp/stream`

  if (ides.length > 0) {
    const transport = await p.select({
      message: "MCP transport mode:",
      options: [
        { value: "local", label: "Local stdio (recommended)", hint: "Runs relay-mcp locally" },
        { value: "remote", label: "Remote HTTP", hint: "Connects to onrelay.app — no local process" }
      ],
      initialValue: "local"
    })

    if (!p.isCancel(transport)) {
      mcpMode = transport as "local" | "remote"
    }
  }

  // Step 7: Install MCP configs and skill files
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
        await installMcpConfigWithMode(ide, mcpMode, remoteUrl, accessToken)
        success(`MCP config → ${pc.dim(ide.mcpConfigPath)}`)

        const skillPath = await installSkillFile(ide)
        if (skillPath) {
          success(`Skill file → ${pc.dim(skillPath)}`)
        }
      }
    }
  }

  // Step 8: Universal skill file
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
