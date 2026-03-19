export function printHelp() {
  console.log(`Relay CLI

Usage:
  relay install [--api-base URL]
  relay auth login [--api-base URL]
  relay auth logout
  relay auth status
  relay brief [projectId] [--profile KEY] [--kind fresh_chat_bootstrap|quick_continuity]
  relay status [projectId]
  relay projects list
  relay projects switch <project-id-or-slug>
`)
}
