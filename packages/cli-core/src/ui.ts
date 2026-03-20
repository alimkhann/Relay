import pc from "picocolors"

export function printBanner() {
  console.log()
  console.log(pc.bold(pc.cyan("  ╭─────────────────────────╮")))
  console.log(pc.bold(pc.cyan("  │                         │")))
  console.log(pc.bold(pc.cyan("  │")) + pc.bold("     Relay CLI Setup     ") + pc.bold(pc.cyan("│")))
  console.log(pc.bold(pc.cyan("  │                         │")))
  console.log(pc.bold(pc.cyan("  ╰─────────────────────────╯")))
  console.log()
  console.log(pc.dim("  Cross-AI memory sync for coding tools"))
  console.log()
}

export function success(message: string) {
  console.log(pc.green("  ✓ ") + message)
}

export function info(message: string) {
  console.log(pc.blue("  ℹ ") + message)
}

export function warn(message: string) {
  console.log(pc.yellow("  ⚠ ") + message)
}

export function error(message: string) {
  console.log(pc.red("  ✗ ") + message)
}

export function step(message: string) {
  console.log(pc.dim("  → ") + message)
}
