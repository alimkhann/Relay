import { runWizardFlow } from "./wizard"

const args = process.argv.slice(2)
const apiBase = args.find((a) => a.startsWith("--api-base="))?.split("=")[1]
const noBrowser = args.includes("--no-browser")

runWizardFlow({
  apiBase,
  openBrowser: !noBrowser
}).catch((error) => {
  console.error(error instanceof Error ? error.message : "Relay Wizard failed")
  process.exit(1)
})
