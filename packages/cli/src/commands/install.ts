import type { RelayCliAnalytics } from "../analytics"
import { runWizard } from "../wizard"

export async function runInstallCommand(options: { apiBase?: string; analytics?: RelayCliAnalytics; openBrowser?: boolean }) {
  await runWizard(options)
}
