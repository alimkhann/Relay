"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"

import { ChromeWebstoreBadge } from "@/components/chrome-webstore-badge"
import { PRICING } from "@/app/(marketing)/pricing.config"
import { Button } from "@/components/ui/button"
import { relayClientFetch } from "@/lib/telemetry/fetch"

const ease = [0.25, 0.1, 0.25, 1] as const

interface Step {
  title: string
  body: string
  video?: { mp4: string; webm?: string; poster: string }
  image?: { src: string; alt: string }
  cta?: React.ReactNode
  planPicker?: boolean
}

const DASHBOARD_STEPS: Step[] = [
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
    body: "Connect Relay's MCP server so your IDE agent (Cursor, Claude Code) reads and writes live project context. Run: npx @onrelay/wizard",
    video: {
      mp4: "/videos/mcp-integration.mp4",
      webm: "/videos/mcp-integration.webm",
      poster: "/images/video-posters/mcp-integration.webp",
    },
  },
  {
    title: "Choose your plan",
    body: "Start free. Upgrade when you need more captures, deeper MCP usage, and more daily AI analyses across your account.",
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

interface WalkthroughModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  surface: "web"
  initialStep?: number
}

function PlanPickerCards({ onContinueFree }: { onContinueFree: () => void }) {
  const [loading, setLoading] = useState<"starter" | "pro" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function checkout(plan: "starter" | "pro") {
    setLoading(plan)
    setError(null)
    try {
      const response = await relayClientFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval: "month", source: "walkthrough" }),
        telemetry: {
          surface: "web-dashboard",
          area: "billing",
          event: "walkthrough_plan_cta_clicked",
          context: { plan, interval: "month" },
          logSuccess: true,
        },
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? "Checkout failed.")
      }
      const payload = (await response.json()) as { checkoutUrl: string }
      window.location.href = payload.checkoutUrl
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout failed.")
      setLoading(null)
    }
  }

  return (
    <div className="px-6 pt-4 pb-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] p-4">
          <h3 className="text-sm font-semibold text-[var(--relay-ink)]">Free</h3>
          <p className="mt-1 flex-1 text-xs text-[var(--relay-muted)]">$0 / forever · {PRICING.free.description}</p>
          <Button className="mt-4 w-full" variant="secondary" onClick={onContinueFree}>
            Continue Free
          </Button>
        </div>
        <div className="flex flex-col rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] p-4">
          <h3 className="text-sm font-semibold text-[var(--relay-ink)]">Starter</h3>
          <p className="mt-1 flex-1 text-xs text-[var(--relay-muted)]">${PRICING.starter.monthlyPrice}/mo · {PRICING.starter.description}</p>
          <Button className="mt-4 w-full" disabled={loading !== null} onClick={() => void checkout("starter")}>
            {loading === "starter" ? "Opening…" : "Get Starter"}
          </Button>
        </div>
        <div className="flex flex-col rounded-[var(--relay-radius-sm)] border border-[var(--relay-accent)]/30 bg-[var(--relay-accent)]/[0.03] p-4">
          <h3 className="text-sm font-semibold text-[var(--relay-ink)]">Pro</h3>
          <p className="mt-1 flex-1 text-xs text-[var(--relay-muted)]">${PRICING.pro.monthlyPrice}/mo · {PRICING.pro.description}</p>
          <Button className="mt-4 w-full" disabled={loading !== null} onClick={() => void checkout("pro")}>
            {loading === "pro" ? "Opening…" : "Get Pro"}
          </Button>
        </div>
      </div>
      {error ? <p className="mt-3 text-xs font-medium text-[var(--relay-danger)]">{error}</p> : null}
    </div>
  )
}

export function WalkthroughModal({ open, onOpenChange, surface, initialStep = 0 }: WalkthroughModalProps) {
  const [step, setStep] = useState(initialStep)
  const videoRef = useRef<HTMLVideoElement>(null)
  const steps = DASHBOARD_STEPS
  const current = steps[step]!
  const isLast = step === steps.length - 1
  const isPlanStep = Boolean(current.planPicker)

  useEffect(() => {
    if (!open) return
    setStep(initialStep)
  }, [open, initialStep])

  useEffect(() => {
    if (!open) return
    if (videoRef.current) {
      videoRef.current.load()
      void videoRef.current.play().catch(() => {})
    }
  }, [step, open])

  async function dismiss() {
    onOpenChange(false)
    window.dispatchEvent(new CustomEvent("relay:walkthrough-dismissed"))
    await relayClientFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        walkthrough: { dismissedAt: new Date().toISOString(), completedVia: surface },
      }),
    })
  }

  function next() {
    if (isLast) {
      void dismiss()
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) void dismiss() }}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              onInteractOutside={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => e.preventDefault()}
            >
              <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease }}
              >
                <motion.div
                  className="relative w-full max-w-2xl rounded-2xl border border-[var(--relay-line)] bg-[var(--relay-bg)] shadow-2xl overflow-hidden"
                  initial={{ scale: 0.96, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: 8 }}
                  transition={{ duration: 0.2, ease }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 pt-5 pb-0">
                    <Dialog.Title className="text-xs font-medium text-[var(--relay-muted)] tracking-wide uppercase">
                      Getting started — {step + 1} of {steps.length}
                    </Dialog.Title>
                    <button
                      onClick={() => void dismiss()}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)] transition-colors"
                      aria-label="Close guide"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Media / Content */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.18, ease }}
                    >
                      {current.planPicker ? (
                        <>
                          <div className="px-6 pt-4 pb-2 space-y-1.5">
                            <h2 className="text-[18px] font-semibold tracking-tight text-[var(--relay-ink)]">
                              {current.title}
                            </h2>
                            <p className="text-[14px] leading-relaxed text-[var(--relay-muted)]">
                              {current.body}
                            </p>
                          </div>
                          <PlanPickerCards onContinueFree={next} />
                        </>
                      ) : (
                        <div className="px-6 pt-4">
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
                                {current.video.webm ? <source src={current.video.webm} type="video/webm" /> : null}
                                <source src={current.video.mp4} type="video/mp4" />
                              </video>
                            </div>
                          ) : current.image ? (
                            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--relay-line)] bg-[var(--relay-soft)]">
                              <Image
                                src={current.image.src}
                                alt={current.image.alt}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 672px"
                              />
                            </div>
                          ) : null}

                          {/* Text */}
                          <div className="py-5 space-y-1.5">
                            <h2 className="text-[18px] font-semibold tracking-tight text-[var(--relay-ink)]">
                              {current.title}
                            </h2>
                            <p className="text-[14px] leading-relaxed text-[var(--relay-muted)]">
                              {current.body}
                            </p>
                          </div>

                          {/* CTA */}
                          {current.cta ? (
                            <div className="pb-2">{current.cta}</div>
                          ) : null}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--relay-line)]">
                    {/* Progress dots */}
                    <div className="flex items-center gap-1.5">
                      {steps.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setStep(i)}
                          aria-label={`Go to step ${i + 1}`}
                          className={`h-1.5 rounded-full transition-all duration-200 ${
                            i === step
                              ? "w-4 bg-[var(--relay-accent)]"
                              : i < step
                                ? "w-1.5 bg-[var(--relay-accent)]/40"
                                : "w-1.5 bg-[var(--relay-line)]"
                          }`}
                        />
                      ))}
                    </div>

                    {/* Buttons — hidden on plan picker step since the cards are the CTAs */}
                    {!isPlanStep && (
                      <div className="flex items-center gap-2">
                        {!isLast && (
                          <button
                            onClick={() => void dismiss()}
                            className="px-3 py-1.5 text-sm text-[var(--relay-muted)] hover:text-[var(--relay-ink)] transition-colors"
                          >
                            Skip
                          </button>
                        )}
                        <button
                          onClick={next}
                          className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[var(--relay-accent)] text-[var(--relay-accent-text)] hover:opacity-90 transition-opacity"
                        >
                          {isLast ? "Done" : "Next →"}
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
