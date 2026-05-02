import { useEffect, useRef, useState } from "react"
import styles from "./walkthrough-modal.module.css"

const BASE_URL = "https://onrelay.app"

interface Step {
  title: string
  body: string
  video?: { mp4: string; webm?: string; poster: string }
  image?: { src: string; alt: string }
  cta?: { href: string; label: string }
}

const EXTENSION_STEPS: Step[] = [
  {
    title: "Auto-capture",
    body: "Open any AI chat you use for this project. With auto-capture on, Relay captures decisions and tasks as you work — no copy-pasting required.",
    video: {
      mp4: `${BASE_URL}/videos/auto-capture.mp4`,
      webm: `${BASE_URL}/videos/auto-capture.webm`,
      poster: `${BASE_URL}/images/video-posters/auto-capture.webp`,
    },
  },
  {
    title: "Insert brief",
    body: "In any AI chat, click Insert Brief in the panel. Relay injects your full project context so you never re-explain yourself again.",
    video: {
      mp4: `${BASE_URL}/videos/project-briefs.mp4`,
      webm: `${BASE_URL}/videos/project-briefs.webm`,
      poster: `${BASE_URL}/images/video-posters/project-briefs.webp`,
    },
  },
  {
    title: "MCP for coding agents",
    body: "Connect Relay's MCP server so your IDE agent (Cursor, Claude Code) reads and writes live project context. Run: npx @onrelay/wizard",
    video: {
      mp4: `${BASE_URL}/videos/mcp-integration.mp4`,
      webm: `${BASE_URL}/videos/mcp-integration.webm`,
      poster: `${BASE_URL}/images/video-posters/mcp-integration.webp`,
    },
  },
  {
    title: "Manage on the dashboard",
    body: "The dashboard is where you manage memories, briefs, captures, and project settings. Everything in one place.",
    image: {
      src: `${BASE_URL}/images/dashboard.webp`,
      alt: "Relay dashboard",
    },
    cta: { href: `${BASE_URL}/dashboard`, label: "Open dashboard →" },
  },
]

interface WalkthroughModalProps {
  onDismiss: () => void
}

export function WalkthroughModal({ onDismiss }: WalkthroughModalProps) {
  const [step, setStep] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const steps = EXTENSION_STEPS
  const current = steps[step]!
  const isLast = step === steps.length - 1

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load()
      void videoRef.current.play().catch(() => {})
    }
  }, [step])

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <span className={styles.stepLabel}>
          Getting started — {step + 1} of {steps.length}
        </span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onDismiss}
          aria-label="Close guide"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="1" y1="1" x2="11" y2="11" />
            <line x1="11" y1="1" x2="1" y2="11" />
          </svg>
        </button>
      </div>

      <div className={styles.body}>
        {current.video ? (
          <div className={styles.media}>
            <video
              ref={videoRef}
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
          <div className={styles.media}>
            <img src={current.image.src} alt={current.image.alt} />
          </div>
        ) : null}

        <p className={styles.title}>{current.title}</p>
        <p className={styles.description}>{current.body}</p>

        {current.cta ? (
          <div className={styles.cta}>
            <a
              href={current.cta.href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.ctaLink}
            >
              {current.cta.label}
            </a>
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        <div className={styles.dots}>
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => setStep(i)}
              className={`${styles.dot} ${
                i === step
                  ? styles.dotActive
                  : i < step
                    ? styles.dotDone
                    : styles.dotFuture
              }`}
            />
          ))}
        </div>
        <div className={styles.buttons}>
          {!isLast && (
            <button type="button" className={styles.skipBtn} onClick={onDismiss}>
              Skip
            </button>
          )}
          <button
            type="button"
            className={styles.nextBtn}
            onClick={() => {
              if (isLast) {
                onDismiss()
              } else {
                setStep((s) => s + 1)
              }
            }}
          >
            {isLast ? "Done" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  )
}
