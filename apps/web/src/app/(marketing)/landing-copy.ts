export type LandingCopyVariant = "control" | "variant"

export interface LandingHeroCopy {
  line1: string
  line2Gradient: string
  subheadLine1: string
  subheadLine2: string
  subheadLine3: string
}

export const LANDING_COPY: Record<LandingCopyVariant, LandingHeroCopy> = {
  control: {
    line1: "Stop repeating yourself",
    line2Gradient: "every AI",
    subheadLine1: "Relay captures what matters from your AI chats",
    subheadLine2: "and keeps a living project brief ready for every fresh conversation",
    subheadLine3: "so you pick up exactly where you left off.",
  },
  variant: {
    line1: "Your AI tools finally",
    line2Gradient: "remember your work",
    subheadLine1: "Relay quietly captures decisions, tasks, and context",
    subheadLine2: "scattered across ChatGPT, Claude, Gemini, and your coding agents",
    subheadLine3: "then hands that memory to every fresh conversation.",
  },
}

export const LANDING_COPY_FLAG = "landing-hero-copy-v1"