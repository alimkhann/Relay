import { runWizard } from "../wizard"

export async function runInstallCommand(options: { apiBase?: string }) {
  await runWizard(options)
}
