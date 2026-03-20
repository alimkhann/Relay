import pc from "picocolors"

import type { RelayCliAnalytics } from "../analytics"
import { info } from "@relay/cli-core"
import { runWizard } from "../wizard"

export async function runInstallCommand(options: { apiBase?: string; analytics?: RelayCliAnalytics; openBrowser?: boolean }) {
  info(pc.yellow("relay install is deprecated. Use: npx @onrelay/wizard"))
  console.log()
  await runWizard(options)
}
