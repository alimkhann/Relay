import type { RelayCliAnalytics } from "../analytics"
import {
  detectIDEs,
  uninstallMcpConfig,
  uninstallSkillFile,
  uninstallUniversalSkillFile,
  clearConfig,
  loadConfig,
  info,
  success
} from "@relay/cli-core"

export async function runUninstallCommand(options: { analytics?: RelayCliAnalytics }) {
  const existing = await loadConfig()
  if (existing) {
    await options.analytics?.identify(existing.apiBase, existing.token)
  }

  const ides = await detectIDEs()
  let removedCount = 0

  for (const ide of ides) {
    const removedMcp = await uninstallMcpConfig(ide)
    const removedSkill = await uninstallSkillFile(ide)
    if (removedMcp || removedSkill) {
      removedCount += 1
    }
  }

  await uninstallUniversalSkillFile()
  await clearConfig()
  options.analytics?.capture("cli_uninstall_completed", { success: true, removed_targets: removedCount })

  success("Removed Relay MCP configuration and cleared local CLI credentials.")
  if (removedCount === 0) {
    info("No existing Relay MCP config entries were found in detected tools.")
  }
}
