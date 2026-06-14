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

// Onboarding persona/source config now lives in @relay/shared so the extension
// onboarding shares one source of truth. Re-exported here to keep existing
// dashboard importers stable.
export {
  ONBOARDING_CODING_AGENTS,
  ONBOARDING_BROWSER_AIS,
  ONBOARDING_SOURCES,
  PERSONA_OPTIONS,
  type OnboardingPersonaKind,
  type OnboardingPersonaOption,
} from "@relay/shared/constants/onboarding"