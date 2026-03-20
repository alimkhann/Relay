"use client"

import Image from "next/image"
import { motion, useInView } from "motion/react"
import { useRef } from "react"
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
import Windsurf from "@lobehub/icons/es/Windsurf"
import GithubCopilot from "@lobehub/icons/es/GithubCopilot"

const ease = [0.25, 0.1, 0.25, 1] as const

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

interface TickerItem {
  name: string
  icon: ReactNode
}

const BROWSER_AIS: TickerItem[] = [
  { name: "ChatGPT", icon: <OpenAI size={16} /> },
  { name: "Claude", icon: <Claude size={16} /> },
  { name: "Gemini", icon: <Gemini size={16} /> },
  { name: "Grok", icon: <Grok size={16} /> },
  { name: "Perplexity", icon: <Perplexity size={16} /> },
  { name: "DeepSeek", icon: <DeepSeek size={16} /> },
]

const IDE_AGENTS: TickerItem[] = [
  { name: "Claude Code", icon: <ClaudeCode size={16} /> },
  { name: "Cursor", icon: <Cursor size={16} /> },
  { name: "Codex", icon: <Codex size={16} /> },
  { name: "Antigravity", icon: <Antigravity size={16} /> },
  { name: "Windsurf", icon: <Windsurf size={16} /> },
  { name: "Copilot", icon: <GithubCopilot size={16} /> },
]

function DiagramTicker({
  items,
  direction = "left",
  speed = "normal",
}: {
  items: TickerItem[]
  direction?: "left" | "right"
  speed?: "slow" | "normal"
}) {
  const duration = speed === "slow" ? "40s" : "25s"

  return (
    <div
      className="relative max-w-[220px] overflow-hidden"
      style={{
        maskImage:
          "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)",
      }}
    >
      <div
        className="flex w-max gap-2.5"
        style={{
          animation: `hiw-ticker ${duration} linear infinite ${direction === "right" ? "reverse" : ""}`,
        }}
      >
        {[...items, ...items, ...items].map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] whitespace-nowrap"
          >
            <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
              {item.icon}
            </span>
            <span className="text-[11px] text-white/55 font-medium">
              {item.name}
            </span>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes hiw-ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
      `}</style>
    </div>
  )
}

function BidirectionalArrow() {
  return (
    <svg className="w-full h-6" viewBox="0 0 120 24" fill="none">
      <polygon points="4,12 12,6 12,18" fill="currentColor" className="text-white/15" />
      <line x1="12" y1="12" x2="108" y2="12" stroke="currentColor" className="text-white/10" strokeWidth="1" strokeDasharray="4 4">
        <animate attributeName="stroke-dashoffset" from="8" to="0" dur="1.5s" repeatCount="indefinite" />
      </line>
      <polygon points="116,12 108,6 108,18" fill="currentColor" className="text-white/15" />
    </svg>
  )
}

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section className="bg-[#0a0a0a] py-24 md:py-32 px-5" ref={ref}>
      <div className="mx-auto max-w-5xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="mb-16"
        >
          <p className="text-[10px] tracking-[0.2em] font-medium text-white/45 uppercase mb-4">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            A calmer loop than copy-pasting
            <br className="hidden sm:block" /> transcripts
          </h2>
        </motion.div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 md:gap-6">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1, ease }}
            >
              <span className="text-4xl md:text-5xl font-semibold text-white/[0.06] tabular-nums leading-none">
                {step.number}
              </span>
              <h3 className="mt-3 text-lg font-medium text-white/90">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-white/45 leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Flow diagram — 3-column ticker layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.8, delay: 0.5, ease }}
          className="mt-20"
        >
          {/* Desktop: 3-column grid */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            {/* Browser Chats column */}
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm font-medium text-white/70">
                Browser Chats
              </span>
              <DiagramTicker items={BROWSER_AIS} direction="left" speed="slow" />
            </div>

            {/* Relay column — elevated */}
            <div className="flex items-center gap-3 relative -top-3">
              <div className="w-16 md:w-20">
                <BidirectionalArrow />
              </div>
              <div className="flex flex-col items-center gap-2 px-4">
                <Image src="/images/relay_logo_white.png" alt="Relay" width={80} height={24} className="h-6 w-auto" />
                <p className="text-[11px] text-white/35 whitespace-nowrap">auto-captures &amp; syncs</p>
              </div>
              <div className="w-16 md:w-20">
                <BidirectionalArrow />
              </div>
            </div>

            {/* IDE Agents column */}
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm font-medium text-white/70">
                IDE Agents
              </span>
              <DiagramTicker items={IDE_AGENTS} direction="right" speed="normal" />
            </div>
          </div>

          {/* Mobile: vertical stack */}
          <div className="flex sm:hidden flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm font-medium text-white/70">Browser Chats</span>
              <DiagramTicker items={BROWSER_AIS} direction="left" speed="slow" />
            </div>
            <span className="text-white/15 text-lg">↕</span>
            <div className="flex flex-col items-center gap-2">
              <Image src="/images/relay_logo_white.png" alt="Relay" width={67} height={20} className="h-5 w-auto" />
              <p className="text-[11px] text-white/35">auto-captures &amp; syncs</p>
            </div>
            <span className="text-white/15 text-lg">↕</span>
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm font-medium text-white/70">IDE Agents</span>
              <DiagramTicker items={IDE_AGENTS} direction="right" speed="normal" />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
