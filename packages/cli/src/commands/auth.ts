import pc from "picocolors"

import type { RelayCliAnalytics } from "../analytics"
import {
  startAuthFlow,
  startScopedMcpAuthFlow,
  clearConfig,
  getConfigPath,
  loadConfig,
  saveConfig,
  info,
  success
} from "@relay/cli-core"

const DEFAULT_API_BASE = "https://onrelay.app"

export async function runAuthCommand(subcommand: string | null, options: { apiBase?: string; analytics?: RelayCliAnalytics; openBrowser?: boolean }) {
  const openBrowser = options.openBrowser ?? (process.env["RELAY_NO_BROWSER"] !== "1" && process.env["BROWSER"] !== "none")

  switch (subcommand ?? "login") {
    case "login": {
      const apiBase = options.apiBase ?? process.env["RELAY_API_BASE"] ?? DEFAULT_API_BASE
      const existing = await loadConfig()
      const auth = await startAuthFlow(apiBase, { openBrowser })
      await options.analytics?.identify(auth.apiBase, auth.token)
      const scopedAuth = existing?.projectId
        ? await startScopedMcpAuthFlow(auth.apiBase, existing.projectId, { openBrowser })
        : null
      await saveConfig({
        apiBase: auth.apiBase,
        token: auth.token,
        projectId: existing?.projectId,
        accessToken: scopedAuth?.accessToken,
        refreshToken: scopedAuth?.refreshToken,
        accessTokenExpiresAt: scopedAuth?.accessExpiresAt,
        refreshTokenExpiresAt: scopedAuth?.refreshExpiresAt
      })
      options.analytics?.capture("cli_auth_completed", {
        success: true,
        project_id: existing?.projectId ?? null,
      })
      success(`Authenticated successfully. Config saved to ${pc.dim(getConfigPath())}`)
      return
    }
    case "logout": {
      options.analytics?.capture("cli_auth_logged_out", { success: true })
      await clearConfig()
      success(`Cleared Relay credentials from ${pc.dim(getConfigPath())}`)
      return
    }
    case "status": {
      const config = await loadConfig()
      if (!config) {
        info("Relay CLI is not authenticated.")
        return
      }

      console.log(`Auth: ${pc.green("configured")}`)
      console.log(`API base: ${config.apiBase}`)
      console.log(`Active project: ${config.projectId ?? "not set"}`)
      console.log(`Config path: ${getConfigPath()}`)
      return
    }
    default:
      throw new Error(`Unknown auth subcommand: ${subcommand}`)
  }
}
