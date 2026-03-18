"use client"

import { motion, useInView } from "motion/react"
import { useRef } from "react"

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
            <br className="hidden sm:block" /> transcripts.
          </h2>
        </motion.div>

        {/* Steps — no connecting lines */}
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

        {/* Flow diagram — bigger boxes, bidirectional arrow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.8, delay: 0.5, ease }}
          className="mt-20 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0"
        >
          {/* Browser Chat box */}
          <div className="px-7 py-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-center min-w-[180px]">
            <p className="text-sm font-medium text-white/70">Browser Chat</p>
            <p className="text-[12px] text-white/30 mt-1">ChatGPT, Claude, Gemini</p>
          </div>

          {/* Bidirectional arrow */}
          <div className="hidden sm:flex items-center w-20 md:w-28">
            <svg className="w-full h-6" viewBox="0 0 120 24" fill="none">
              {/* Left arrow head */}
              <polygon points="4,12 12,6 12,18" fill="currentColor" className="text-white/15" />
              {/* Line */}
              <line x1="12" y1="12" x2="108" y2="12" stroke="currentColor" className="text-white/10" strokeWidth="1" strokeDasharray="4 4">
                <animate attributeName="stroke-dashoffset" from="8" to="0" dur="1.5s" repeatCount="indefinite" />
              </line>
              {/* Right arrow head */}
              <polygon points="116,12 108,6 108,18" fill="currentColor" className="text-white/15" />
            </svg>
          </div>
          {/* Mobile vertical arrow */}
          <div className="sm:hidden text-white/15 text-lg">↕</div>

          {/* Relay box */}
          <div className="px-7 py-5 rounded-2xl border border-white/[0.16] bg-white/[0.05] text-center min-w-[180px] shadow-[0_0_30px_rgba(255,255,255,0.04)]">
            <p className="text-sm font-medium text-transparent bg-clip-text bg-gradient-to-r from-white via-[#ededf2] to-[#b9bac4]">Relay</p>
            <p className="text-[12px] text-white/30 mt-1">auto-captures & syncs</p>
          </div>

          {/* Bidirectional arrow */}
          <div className="hidden sm:flex items-center w-20 md:w-28">
            <svg className="w-full h-6" viewBox="0 0 120 24" fill="none">
              <polygon points="4,12 12,6 12,18" fill="currentColor" className="text-white/15" />
              <line x1="12" y1="12" x2="108" y2="12" stroke="currentColor" className="text-white/10" strokeWidth="1" strokeDasharray="4 4">
                <animate attributeName="stroke-dashoffset" from="8" to="0" dur="1.5s" repeatCount="indefinite" />
              </line>
              <polygon points="116,12 108,6 108,18" fill="currentColor" className="text-white/15" />
            </svg>
          </div>
          <div className="sm:hidden text-white/15 text-lg">↕</div>

          {/* IDE Agent box */}
          <div className="px-7 py-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-center min-w-[180px]">
            <p className="text-sm font-medium text-white/70">IDE Agent / New Chat</p>
            <p className="text-[12px] text-white/30 mt-1">reads & writes brief</p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
