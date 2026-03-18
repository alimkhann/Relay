"use client"

import { motion, useInView } from "motion/react"
import { useRef } from "react"
import { Zap, FileText, Terminal, ArrowLeftRight } from "lucide-react"

const ease = [0.25, 0.1, 0.25, 1] as const

const FEATURES = [
  {
    icon: Zap,
    label: "AUTO-CAPTURE",
    title: "Quietly saves what matters from every AI chat",
    description:
      "Work in ChatGPT, Claude, or Gemini. Relay captures decisions, tasks, and constraints automatically — no manual saving.",
  },
  {
    icon: FileText,
    label: "PROJECT BRIEFS",
    title: "One-click context restoration in fresh chats",
    description:
      "Your project brief updates itself as you work. Open a new chat and inject the full context instantly.",
  },
  {
    icon: Terminal,
    label: "MCP INTEGRATION",
    title: "Your coding agent reads and writes project memory",
    description:
      "Claude Code, Cursor, and any MCP-compatible agent connect directly. They share the same brief as your browser chats.",
  },
  {
    icon: ArrowLeftRight,
    label: "CROSS-SURFACE SYNC",
    title: "Decisions flow between tools automatically",
    description:
      "A choice made in ChatGPT surfaces in Cursor. A constraint set in Claude Code stays in sync with your next browser session.",
  },
]

export function FeaturesSection() {
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
          className="mb-14"
        >
          <p className="text-[10px] tracking-[0.2em] font-medium text-white/25 uppercase mb-4">
            What Relay does
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Context that moves with you.
          </h2>
        </motion.div>

        {/* Card grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : undefined}
              transition={{
                duration: 0.5,
                delay: 0.1 + i * 0.08,
                ease,
              }}
              className="rounded-2xl border border-white/[0.06] bg-[#111] p-6 md:p-7 group hover:border-white/[0.1] transition-colors duration-300"
            >
              <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-5">
                <feature.icon
                  size={16}
                  className="text-teal-400/70"
                  strokeWidth={1.5}
                />
              </div>
              <p className="text-[10px] tracking-[0.2em] font-medium text-teal-400/50 uppercase mb-2">
                {feature.label}
              </p>
              <h3 className="text-lg font-medium text-white/90 mb-2 leading-snug">
                {feature.title}
              </h3>
              <p className="text-sm text-white/40 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
