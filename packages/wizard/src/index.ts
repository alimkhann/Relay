import { runWizardFlow } from "./wizard"

const args = process.argv.slice(2)
const apiBase = args.find((a) => a.startsWith("--api-base="))?.split("=")[1]
const noBrowser = args.includes("--no-browser")
const ci = args.includes("--ci")
const modeArg = args.find((a) => a.startsWith("--mode="))?.split("=")[1]
const transportArg = args.find((a) => a.startsWith("--transport="))?.split("=")[1]
const remoteUrl = args.find((a) => a.startsWith("--remote-url="))?.split("=")[1]
const mode = modeArg === "advanced" || modeArg === "manual" || modeArg === "uninstall" || modeArg === "default"
  ? modeArg
  : args.includes("--manual")
    ? "manual"
    : args.includes("--uninstall")
      ? "uninstall"
      : undefined
const installMode = transportArg === "remote" || args.includes("--remote")
  ? "remote"
  : transportArg === "local" || args.includes("--local")
    ? "local"
    : undefined

runWizardFlow({
  apiBase,
  openBrowser: !noBrowser,
  ci,
  mode,
  installMode,
  remoteUrl,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : "Relay Wizard failed")
  process.exit(1)
})
