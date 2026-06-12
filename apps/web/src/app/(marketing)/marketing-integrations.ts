export const INTEGRATIONS_TODAY = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Grok",
  "Perplexity",
  "DeepSeek",
  "Claude Code",
  "Cursor",
  "Codex",
  "Copilot",
  "Antigravity",
] as const

export const INTEGRATIONS_NEXT = [
  "Telegram",
  "WhatsApp",
  "Discord",
  "Gmail",
  "Calendar",
  "Notion",
  "Linear",
  "Jira",
  "Slack",
  "GitHub",
] as const

/** Coding agents shown in onboarding source picker (subset of today). */
export const ONBOARDING_CODING_AGENTS = [
  "Claude Code",
  "Codex",
  "Cursor",
  "Copilot",
  "Antigravity",
  "Grok",
] as const

export const ONBOARDING_BROWSER_AIS = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Grok",
  "Perplexity",
  "DeepSeek",
] as const

const ONBOARDING_COMMON = [
  "Docs & PDFs",
  "Telegram",
  "WhatsApp",
  "Slack",
  "Jira",
  "Linear",
  "Notion",
  "Gmail",
  "Calendar",
  "GitHub",
  "Discord",
] as const

function mergeSources(...groups: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const group of groups) {
    for (const item of group) {
      if (!seen.has(item)) {
        seen.add(item)
        merged.push(item)
      }
    }
  }
  return merged
}

export type OnboardingPersonaKind =
  | "project_work"
  | "personal"
  | "relationships"
  | "team"
  | "research"
  | "content"

export const ONBOARDING_SOURCES: Record<OnboardingPersonaKind, readonly string[]> = {
  project_work: mergeSources(
    ONBOARDING_BROWSER_AIS,
    ONBOARDING_CODING_AGENTS,
    ONBOARDING_COMMON,
  ),
  personal: mergeSources(ONBOARDING_BROWSER_AIS, ["Notes", "Apple Notes", "Voice memos"], ONBOARDING_COMMON),
  relationships: mergeSources(
    ["LinkedIn", "CRM", "iMessage"],
    ONBOARDING_COMMON,
  ),
  team: mergeSources(["ChatGPT", "Claude", "Confluence", "Asana"], ONBOARDING_COMMON),
  research: mergeSources(
    ONBOARDING_BROWSER_AIS,
    ["PDFs", "Google Docs", "Obsidian", "Zotero"],
    ONBOARDING_COMMON,
  ),
  content: mergeSources(
    ONBOARDING_BROWSER_AIS,
    ["Google Docs", "Substack", "Twitter / X", "Figma", "YouTube"],
    ONBOARDING_COMMON,
  ),
}