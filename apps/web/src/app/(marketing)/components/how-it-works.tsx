"use client"

import Image from "next/image"
import { motion, useInView, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import OpenAI from "@lobehub/icons/es/OpenAI"
import Claude from "@lobehub/icons/es/Claude"
import Gemini from "@lobehub/icons/es/Gemini"
import Grok from "@lobehub/icons/es/Grok"
import Perplexity from "@lobehub/icons/es/Perplexity"
import DeepSeek from "@lobehub/icons/es/DeepSeek"
import ClaudeCode from "@lobehub/icons/es/ClaudeCode"
import Cursor from "@lobehub/icons/es/Cursor"
import Codex from "@lobehub/icons/es/Codex"
import Antigravity from "@lobehub/icons/es/Antigravity"
import GithubCopilot from "@lobehub/icons/es/GithubCopilot"
import styles from "./how-it-works-orbit.module.css"

const ease = [0.25, 0.1, 0.25, 1] as const
const ORBIT_RADIUS_PX = 58
const ORBIT_DURATION_MS = 22_000
const BADGE_SIZE_PX = 48

function useOrbitAngle(reverse: boolean, active: boolean) {
  const [angle, setAngle] = useState(0)

  useEffect(() => {
    if (!active) return

    let frame = 0
    const startedAt = performance.now()

    const tick = (now: number) => {
      const progress = ((now - startedAt) % ORBIT_DURATION_MS) / ORBIT_DURATION_MS
      setAngle((reverse ? -progress : progress) * 360)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [reverse, active])

  return angle
}

const STEPS = [
  {
    number: "01",
    title: "Relay captures as you chat",
    description:
      "Work in any supported AI. Relay quietly extracts decisions, tasks, and constraints from the conversation — nothing manual.",
  },
  {
    number: "02",
    title: "Context flows both ways",
    description:
      "Your project brief updates itself across sessions and tools. What you decide in the browser reaches your IDE agent via MCP — and vice versa.",
  },
  {
    number: "03",
    title: "One click fills the next chat",
    description:
      "Open a fresh conversation. Insert your project brief. Keep building exactly where you left off.",
  },
]

const BROWSER_ICONS: ReactNode[] = [
  <OpenAI key="openai" size={18} />,
  <Claude key="claude" size={18} />,
  <Gemini key="gemini" size={18} />,
  <Grok key="grok" size={18} />,
  <Perplexity key="perplexity" size={18} />,
  <DeepSeek key="deepseek" size={18} />,
]

const IDE_ICONS: ReactNode[] = [
  <ClaudeCode key="claude-code" size={18} />,
  <Cursor key="cursor" size={18} />,
  <Codex key="codex" size={18} />,
  <Antigravity key="antigravity" size={18} />,
  <GithubCopilot key="copilot" size={18} />,
  <Grok key="grok-ide" size={18} />,
]

function IconOrbit({
  icons,
  label,
  reverse = false,
}: {
  icons: ReactNode[]
  label: string
  reverse?: boolean
}) {
  const reducedMotion = useReducedMotion()
  const orbitAngle = useOrbitAngle(reverse, !reducedMotion)
  const step = 360 / icons.length
  const badgeOffset = BADGE_SIZE_PX / 2

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm font-medium text-white/70">{label}</p>
      <div className={styles.orbitStage} aria-hidden>
        {icons.map((icon, index) => {
          const radians = ((step * index + orbitAngle) * Math.PI) / 180
          const x = Math.sin(radians) * ORBIT_RADIUS_PX
          const y = -Math.cos(radians) * ORBIT_RADIUS_PX

          return (
            <div
              key={index}
              className={styles.orbitBadge}
              style={{
                left: `calc(50% + ${x}px - ${badgeOffset}px)`,
                top: `calc(50% + ${y}px - ${badgeOffset}px)`,
              }}
            >
              {icon}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FlowConnector({ orientation }: { orientation: "horizontal" | "vertical" }) {
  if (orientation === "vertical") {
    return (
      <svg className="h-14 w-8 shrink-0" viewBox="0 0 32 56" fill="none" aria-hidden>
        <defs>
          <linearGradient id="flow-v" x1="16" y1="4" x2="16" y2="52" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(255,255,255,0.22)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.06)" />
          </linearGradient>
        </defs>
        <polygon points="16,6 10,16 22,16" fill="url(#flow-v)" />
        <line x1="16" y1="16" x2="16" y2="40" stroke="url(#flow-v)" strokeWidth="1.5" strokeDasharray="5 5">
          <animate attributeName="stroke-dashoffset" from="10" to="0" dur="1.2s" repeatCount="indefinite" />
        </line>
        <polygon points="16,50 10,40 22,40" fill="url(#flow-v)" />
      </svg>
    )
  }

  return (
    <svg className="h-8 w-full min-w-[72px] max-w-[120px]" viewBox="0 0 120 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="flow-h" x1="4" y1="16" x2="116" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(255,255,255,0.22)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.06)" />
        </linearGradient>
      </defs>
      <polygon points="6,16 16,8 16,24" fill="url(#flow-h)" />
      <line x1="16" y1="16" x2="104" y2="16" stroke="url(#flow-h)" strokeWidth="1.5" strokeDasharray="5 5">
        <animate attributeName="stroke-dashoffset" from="10" to="0" dur="1.2s" repeatCount="indefinite" />
      </line>
      <polygon points="114,16 104,8 104,24" fill="url(#flow-h)" />
    </svg>
  )
}

function RelayHub() {
  return (
    <div className="flex flex-col items-center gap-3 px-2">
      <Image
        src="/images/relay_logo_white.png"
        alt="Relay"
        width={120}
        height={36}
        className="h-9 w-auto md:h-11"
      />
      <p className="max-w-[12rem] text-center text-[11px] leading-snug text-white/40">
        Captures context from chats and syncs it to your agents
      </p>
    </div>
  )
}

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section className="bg-[#0a0a0a] px-5 py-24 md:py-32" ref={ref}>
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="mb-16"
        >
          <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            A calmer loop than copy-pasting
            <br className="hidden sm:block" /> transcripts
          </h2>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1, ease }}
            >
              <span className="text-4xl font-semibold leading-none text-white/[0.06] tabular-nums md:text-5xl">
                {step.number}
              </span>
              <h3 className="mt-3 text-lg font-medium text-white/90">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/45">{step.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.8, delay: 0.5, ease }}
          className="mt-20"
        >
          <div className="hidden items-center justify-center gap-6 lg:flex lg:gap-8">
            <IconOrbit icons={BROWSER_ICONS} label="Browser chats" />
            <FlowConnector orientation="horizontal" />
            <RelayHub />
            <FlowConnector orientation="horizontal" />
            <IconOrbit icons={IDE_ICONS} label="IDE agents" reverse />
          </div>

          <div className="flex flex-col items-center gap-5 lg:hidden">
            <IconOrbit icons={BROWSER_ICONS} label="Browser chats" />
            <FlowConnector orientation="vertical" />
            <RelayHub />
            <FlowConnector orientation="vertical" />
            <IconOrbit icons={IDE_ICONS} label="IDE agents" reverse />
          </div>
        </motion.div>
      </div>
    </section>
  )
}