import pc from "picocolors"

import { startAuthFlow, startScopedMcpAuthFlow } from "../auth"
import { clearConfig, getConfigPath, loadConfig, saveConfig } from "../config"
import { info, success } from "../ui"

const DEFAULT_API_BASE = "https://onrelay.app"

export async function runAuthCommand(subcommand: string | null, options: { apiBase?: string }) {
  switch (subcommand ?? "login") {
    case "login": {
      const apiBase = options.apiBase ?? process.env["RELAY_API_BASE"] ?? DEFAULT_API_BASE
      const existing = await loadConfig()
      const auth = await startAuthFlow(apiBase)
      const scopedAuth = existing?.projectId
        ? await startScopedMcpAuthFlow(auth.apiBase, existing.projectId)
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
      success(`Authenticated successfully. Config saved to ${pc.dim(getConfigPath())}`)
      return
    }
    case "logout": {
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
