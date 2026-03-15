import { runWizard } from "./wizard"

const args = process.argv.slice(2)

let apiBase: string | undefined
const apiBaseIndex = args.indexOf("--api-base")
if (apiBaseIndex !== -1 && args[apiBaseIndex + 1]) {
  apiBase = args[apiBaseIndex + 1]
}

runWizard({ apiBase }).catch((error) => {
  console.error(error instanceof Error ? error.message : "Setup failed")
  process.exit(1)
})
