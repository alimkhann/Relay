"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import * as Dialog from "@radix-ui/react-dialog"
import { ArrowLeft, X } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"

import { ONBOARDING_SOURCES } from "@/app/(marketing)/marketing-integrations"
import { ChromeWebstoreBadge } from "@/components/chrome-webstore-badge"
import { PaywallPlanCards } from "@/components/billing/paywall-plan-cards"
import { relayClientFetch } from "@/lib/telemetry/fetch"

const ease = [0.25, 0.1, 0.25, 1] as const
const WIZARD_COMMAND = "npx @onrelay/wizard"

interface Step {
  title: string
  body: string
  video?: { mp4: string; webm?: string; poster: string }
  image?: { src: string; alt: string }
  cta?: React.ReactNode
  planPicker?: boolean
  personaPicker?: "kind" | "sources"
  wizardCommand?: boolean
}

export type PersonaKind = keyof typeof ONBOARDING_SOURCES

const PERSONA_OPTIONS: Array<{ kind: PersonaKind; label: string; hint: string }> = [
  { kind: "project_work", label: "My AI & coding work", hint: "Projects, decisions, code context" },
  { kind: "personal", label: "My personal life", hint: "Commitments, ideas, things I tell AI" },
  { kind: "relationships", label: "People & follow-ups", hint: "Contacts, promises, conversations" },
  { kind: "team", label: "Team decisions", hint: "Shared projects and why we chose things" },
  { kind: "research", label: "Research & learning", hint: "Papers, notes, things you're figuring out" },
  { kind: "content", label: "Writing & content", hint: "Drafts, posts, scripts, creative work" },
]

const DASHBOARD_STEPS: Step[] = [
  {
    title: "What should Relay remember?",
    body: "Pick what matters most — Relay tailors the setup to it.",
    personaPicker: "kind",
  },
  {
    title: "Where is your context today?",
    body: "Select everywhere your work and decisions currently live.",
    personaPicker: "sources",
  },
  {
    title: "Auto-capture",
    body: "Open any AI chat you use for this project. With auto-capture on, Relay captures decisions and tasks as you work — no copy-pasting required.",
    video: {
      mp4: "/videos/auto-capture.mp4",
      webm: "/videos/auto-capture.webm",
      poster: "/images/video-posters/auto-capture.webp",
    },
  },
  {
    title: "Insert brief",
    body: "Open a new AI chat and click Insert Brief in the extension. Relay injects your full project context so you never re-explain yourself again.",
    video: {
      mp4: "/videos/project-briefs.mp4",
      webm: "/videos/project-briefs.webm",
      poster: "/images/video-posters/project-briefs.webp",
    },
  },
  {
    title: "MCP for coding agents",
    body: "Connect Relay's MCP server so your IDE agent (Cursor, Claude Code) reads and writes live project context.",
    wizardCommand: true,
    video: {
      mp4: "/videos/mcp-integration.mp4",
      webm: "/videos/mcp-integration.webm",
      poster: "/images/video-posters/mcp-integration.webp",
    },
  },
  {
    title: "Choose your plan",
    body: "",
    planPicker: true,
  },
  {
    title: "Get the browser extension",
    body: "Install the Chrome extension to capture context from ChatGPT, Claude, Gemini, and other AI chats directly in your browser.",
    image: {
      src: "/images/extension.webp",
      alt: "Relay browser extension",
    },
    cta: <ChromeWebstoreBadge source="walkthrough_modal" label="Add to Chrome — it's free" />,
  },
]

/** Auto-capture — first guide step when reopened from the dashboard help icon. */
export const GUIDE_START_STEP = 2

export type WalkthroughMode = "onboarding" | "guide"

interface WalkthroughModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  surface: "web"
  initialStep?: number | "extension"
  mode?: WalkthroughMode
}

function resolveInitialStep(initialStep: number | "extension"): number {
  if (initialStep === "extension") {
    const index = DASHBOARD_STEPS.findIndex((step) =>
      step.title.toLowerCase().includes("extension"),
    )
    return index >= 0 ? index : 0
  }
  return initialStep
}

function WalkthroughShell({
  children,
  maxWidth = "max-w-2xl",
  dismissible = false,
  onDismiss,
}: {
  children: React.ReactNode
  maxWidth?: string
  dismissible?: boolean
  onDismiss?: () => void
}) {
  return (
    <Dialog.Root open onOpenChange={() => {}}>
      <Dialog.Portal forceMount>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
          <Dialog.Content
            className={`relative z-10 flex max-h-[min(90vh,820px)] w-full ${maxWidth} origin-center scale-[1.25] flex-col overflow-y-auto bg-transparent shadow-none outline-none`}
          >
            {dismissible && onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Close guide"
                className="absolute -right-1 -top-1 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--relay-line)] bg-[var(--relay-soft)]/80 text-[var(--relay-muted)] backdrop-blur-sm transition-colors hover:border-[var(--relay-line-strong)] hover:text-[var(--relay-ink)] sm:-right-2 sm:-top-2"
              >
                <X size={16} />
              </button>
            ) : null}
            {children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function StepFooter({
  showBack,
  onBack,
  showNext,
  onNext,
  nextLabel,
  nextDisabled = false,
}: {
  showBack: boolean
  onBack: () => void
  showNext: boolean
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
}) {
  if (!showBack && !showNext) return null

  return (
    <div className="mt-5 flex items-center gap-3">
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--relay-line)] text-[var(--relay-muted)] transition-colors hover:border-[var(--relay-line-strong)] hover:text-[var(--relay-ink)]"
        >
          <ArrowLeft size={16} />
        </button>
      ) : null}
      {showNext ? (
        <button
          type="button"
          disabled={nextDisabled}
          onClick={onNext}
          className="inline-flex flex-1 items-center justify-center rounded-full bg-[var(--relay-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--relay-accent-text)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {nextLabel}
        </button>
      ) : null}
    </div>
  )
}

export function WalkthroughModal({
  open,
  onOpenChange,
  surface,
  initialStep = 0,
  mode = "onboarding",
}: WalkthroughModalProps) {
  const isGuide = mode === "guide"
  const minStep = isGuide ? GUIDE_START_STEP : 0
  const resolvedInitial = isGuide ? GUIDE_START_STEP : resolveInitialStep(initialStep)
  const [step, setStep] = useState(resolvedInitial)
  const [personaKind, setPersonaKind] = useState<PersonaKind | null>(null)
  const [personaSources, setPersonaSources] = useState<string[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const steps = DASHBOARD_STEPS
  const current = steps[step]!
  const isLast = step === steps.length - 1
  const isPlanStep = Boolean(current.planPicker)
  const sourcesReady = personaSources.length > 0

  useEffect(() => {
    if (!open) return
    setStep(isGuide ? GUIDE_START_STEP : resolveInitialStep(initialStep))
  }, [open, initialStep, isGuide])

  useEffect(() => {
    if (!open || isPlanStep) return
    if (videoRef.current) {
      videoRef.current.load()
      void videoRef.current.play().catch(() => {})
    }
  }, [step, open, isPlanStep])

  async function complete() {
    onOpenChange(false)
    window.dispatchEvent(new CustomEvent("relay:walkthrough-dismissed"))
    await relayClientFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        walkthrough: { dismissedAt: new Date().toISOString(), completedVia: surface },
      }),
    })
  }

  function advanceTo(nextStep: number) {
    setStep(nextStep)
  }

  function dismiss() {
    onOpenChange(false)
  }

  function next() {
    if (isLast) {
      if (isGuide) {
        dismiss()
        return
      }
      void complete()
    } else {
      advanceTo(step + 1)
    }
  }

  function back() {
    if (step > minStep) setStep(step - 1)
  }

  function choosePersonaKind(kind: PersonaKind) {
    setPersonaKind(kind)
    setPersonaSources([])
    advanceTo(1)
  }

  function togglePersonaSource(source: string) {
    setPersonaSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source],
    )
  }

  function commitPersona() {
    if (!sourcesReady) return
    void relayClientFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        persona: { kind: personaKind, contextSources: personaSources },
      }),
      telemetry: {
        surface: "web-dashboard",
        area: "onboarding",
        event: "onboarding_persona_selected",
        context: {
          persona: personaKind,
          source: personaSources.join(",").slice(0, 200) || null,
        },
        logSuccess: true,
      },
    }).catch(() => {})
    next()
  }

  if (!open) return null

  const showFooterBack = step > minStep && !isPlanStep
  const showFooterNext =
    !isPlanStep && current.personaPicker !== "kind"
  const footerNextLabel = isLast ? "Done" : "Next"
  const footerNextAction =
    current.personaPicker === "sources" ? commitPersona : next
  const footerNextDisabled =
    current.personaPicker === "sources" && !sourcesReady

  return (
    <WalkthroughShell
      maxWidth={isPlanStep ? "max-w-xl" : "max-w-2xl"}
      dismissible={isGuide}
      onDismiss={dismiss}
    >
      <div className="px-6 py-8 sm:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease }}
          >
            {isPlanStep ? (
              <div>
                <div className="text-center">
                  <Dialog.Title className="text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
                    {current.title}
                  </Dialog.Title>
                </div>
                <div className="mt-8">
                  <PaywallPlanCards
                    source="walkthrough"
                    variant="walkthrough"
                    onContinueFree={next}
                    onBack={back}
                    footerLayout
                  />
                </div>
              </div>
            ) : current.personaPicker === "kind" ? (
              <div>
                <div className="space-y-1.5 text-center">
                  <Dialog.Title className="text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
                    {current.title}
                  </Dialog.Title>
                  <p className="text-[14px] leading-relaxed text-[var(--relay-muted)]">
                    {current.body}
                  </p>
                </div>
                <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {PERSONA_OPTIONS.map((option) => (
                    <button
                      key={option.kind}
                      type="button"
                      onClick={() => choosePersonaKind(option.kind)}
                      className={`rounded-xl border p-4 text-left transition-colors hover:border-[var(--relay-accent)]/50 hover:bg-[var(--relay-soft)]/60 ${
                        personaKind === option.kind
                          ? "border-[var(--relay-accent)]/60 bg-[var(--relay-accent)]/[0.04]"
                          : "border-[var(--relay-line)] bg-[var(--relay-soft)]/40"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-[var(--relay-ink)]">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--relay-muted)]">
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
                <StepFooter
                  showBack={showFooterBack}
                  onBack={back}
                  showNext={false}
                  onNext={next}
                  nextLabel={footerNextLabel}
                />
              </div>
            ) : current.personaPicker === "sources" ? (
              <div>
                <div className="space-y-1.5 text-center">
                  <Dialog.Title className="text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
                    {current.title}
                  </Dialog.Title>
                  <p className="text-[14px] leading-relaxed text-[var(--relay-muted)]">
                    {current.body}
                  </p>
                </div>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {ONBOARDING_SOURCES[personaKind ?? "project_work"].map((source) => {
                    const selected = personaSources.includes(source)
                    return (
                      <button
                        key={source}
                        type="button"
                        onClick={() => togglePersonaSource(source)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                          selected
                            ? "border-[var(--relay-accent)]/60 bg-[var(--relay-accent)] text-[var(--relay-accent-text)]"
                            : "border-[var(--relay-line)] bg-[var(--relay-soft)]/40 text-[var(--relay-ink-secondary)] hover:bg-[var(--relay-soft)]/60"
                        }`}
                      >
                        {source}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-3 text-center text-xs text-[var(--relay-muted)]">
                  Relay starts with AI chats and coding agents today — Telegram, WhatsApp, and more are coming next.
                </p>
                <StepFooter
                  showBack={showFooterBack}
                  onBack={back}
                  showNext={showFooterNext}
                  onNext={footerNextAction}
                  nextLabel={footerNextLabel}
                  nextDisabled={footerNextDisabled}
                />
              </div>
            ) : (
              <div>
                {current.video ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--relay-line)] bg-black">
                    <video
                      ref={videoRef}
                      className="h-full w-full object-cover"
                      poster={current.video.poster}
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                    >
                      {current.video.webm ? (
                        <source src={current.video.webm} type="video/webm" />
                      ) : null}
                      <source src={current.video.mp4} type="video/mp4" />
                    </video>
                  </div>
                ) : current.image ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--relay-line)] bg-[var(--relay-soft)]/40">
                    <Image
                      src={current.image.src}
                      alt={current.image.alt}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 672px"
                      unoptimized
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5 py-5 text-center">
                  <Dialog.Title className="text-xl font-semibold tracking-tight text-[var(--relay-ink)]">
                    {current.title}
                  </Dialog.Title>
                  <p className="text-[14px] leading-relaxed text-[var(--relay-muted)]">
                    {current.body}
                  </p>
                  {current.wizardCommand ? (
                    <div className="mx-auto mt-3 max-w-md rounded-lg border border-[var(--relay-line)] bg-[var(--relay-soft)]/40 px-4 py-3 text-left">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--relay-muted)]">
                        One-command setup
                      </p>
                      <code className="mt-1.5 block font-mono text-sm text-[var(--relay-ink)]">
                        {WIZARD_COMMAND}
                      </code>
                    </div>
                  ) : null}
                </div>

                {current.cta ? (
                  <div className="flex justify-center pb-2">{current.cta}</div>
                ) : null}

                <StepFooter
                  showBack={showFooterBack}
                  onBack={back}
                  showNext={showFooterNext}
                  onNext={footerNextAction}
                  nextLabel={footerNextLabel}
                  nextDisabled={footerNextDisabled}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </WalkthroughShell>
  )
}