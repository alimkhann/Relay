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
    title: "Your project brief stays current",
    description:
      "Across sessions and tools, the brief updates itself. Context flows between browser chats and your IDE agent via MCP.",
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
          <p className="text-[10px] tracking-[0.2em] font-medium text-white/25 uppercase mb-4">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            A calmer loop than copy-pasting
            <br className="hidden sm:block" /> transcripts.
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
              className="relative"
            >
              {/* Connecting line on desktop */}
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-6 left-full w-full h-px">
                  <div className="h-full w-full border-t border-dashed border-white/[0.08]" />
                </div>
              )}

              <span className="text-4xl md:text-5xl font-semibold text-white/[0.05] tabular-nums leading-none">
                {step.number}
              </span>
              <h3 className="mt-3 text-lg font-medium text-white/90">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-white/40 leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Flow diagram */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.8, delay: 0.5, ease }}
          className="mt-20 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0"
        >
          {[
            { label: "Browser Chat", sub: "ChatGPT, Claude..." },
            { label: "Relay", sub: "auto-captures", highlight: true },
            { label: "IDE Agent / New Chat", sub: "reads latest brief" },
          ].map((node, i) => (
            <div key={node.label} className="flex items-center">
              {i > 0 && (
                <div className="hidden sm:flex items-center w-16 md:w-24">
                  <svg
                    className="w-full h-4"
                    viewBox="0 0 100 16"
                    fill="none"
                  >
                    <line
                      x1="0"
                      y1="8"
                      x2="88"
                      y2="8"
                      stroke="currentColor"
                      className="text-white/10"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="8"
                        to="0"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    </line>
                    <polygon
                      points="88,4 96,8 88,12"
                      fill="currentColor"
                      className="text-white/10"
                    />
                  </svg>
                </div>
              )}
              <div
                className={`px-5 py-3 rounded-xl border text-center min-w-[140px] ${
                  node.highlight
                    ? "border-teal-400/20 bg-teal-400/[0.04]"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    node.highlight ? "text-teal-400/80" : "text-white/60"
                  }`}
                >
                  {node.label}
                </p>
                <p className="text-[11px] text-white/25 mt-0.5">{node.sub}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
