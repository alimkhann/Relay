import * as p from "@clack/prompts"
import pc from "picocolors"

import {
  detectIDEs,
  uninstallMcpConfig,
  uninstallSkillFile,
  uninstallUniversalSkillFile,
  clearConfig,
  success,
  info
} from "@relay/cli-core"

export async function runUninstall() {
  const ides = await detectIDEs()

  if (ides.length === 0) {
    info("No IDE configurations detected.")
  } else {
    const choices = ides.map((ide) => ({
      value: ide.id,
      label: ide.name,
    }))

    const selectedIdeIds = await p.multiselect({
      message: "Remove Relay MCP config from:",
      options: choices,
      initialValues: choices.map((c) => c.value),
      required: false,
    })

    if (!p.isCancel(selectedIdeIds)) {
      const selectedIdes = ides.filter((ide) => (selectedIdeIds as string[]).includes(ide.id))

      for (const ide of selectedIdes) {
        const removedMcp = await uninstallMcpConfig(ide)
        const removedSkill = await uninstallSkillFile(ide)
        if (removedMcp) success(`Removed MCP config from ${ide.name}`)
        if (removedSkill) success(`Removed skill file from ${ide.name}`)
      }
    }
  }

  const shouldClearCreds = await p.confirm({
    message: "Remove stored credentials (~/.relay/mcp.json)?",
    initialValue: true,
  })

  if (!p.isCancel(shouldClearCreds) && shouldClearCreds) {
    await clearConfig()
    success("Credentials cleared.")
  }

  const shouldRemoveUniversal = await p.confirm({
    message: "Remove universal skill file (~/.agents/skills/relay/)?",
    initialValue: true,
  })

  if (!p.isCancel(shouldRemoveUniversal) && shouldRemoveUniversal) {
    await uninstallUniversalSkillFile()
    success("Universal skill file removed.")
  }

  console.log()
  p.outro(pc.bold("Relay uninstalled."))
}
