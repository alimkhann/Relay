"use client"

import { motion, useInView } from "motion/react"
import { useRef, useState } from "react"
import { Copy, Check } from "lucide-react"
import { MCP_AGENTS } from "../mcp-agents.config"

const ease = [0.25, 0.1, 0.25, 1] as const

const FLOW_STEPS = [
  {
    num: "1",
    text: "Browser chat → Relay captures context",
  },
  {
    num: "2",
    text: "Relay → project brief updates automatically",
  },
  {
    num: "3",
    text: "IDE agent → reads latest brief via MCP",
  },
  {
    num: "←",
    text: "writes back decisions and progress",
    dimmed: true,
  },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors text-white/35 hover:text-white/60"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-emerald-400/80" /> : <Copy size={14} />}
    </button>
  )
}

export function McpSection() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section id="mcp" className="bg-[#0a0a0a] py-24 md:py-32 px-5" ref={ref}>
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="mb-6"
        >
          <p className="text-[10px] tracking-[0.2em] font-medium text-white/45 uppercase mb-4">
            MCP Integration
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white leading-tight">
            Your coding agent,
            <br />
            fully in the loop
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="text-base text-white/50 leading-relaxed max-w-2xl mb-14"
        >
          MCP (Model Context Protocol) is an open standard that lets AI agents
          read and write structured memory. Relay implements it as a bridge
          between your browser sessions and any IDE agent.
        </motion.p>

        <div className="grid md:grid-cols-2 gap-8 md:gap-12">
          {/* Left — Flow diagram */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.5, delay: 0.15, ease }}
            className="space-y-0"
          >
            {FLOW_STEPS.map((step, i) => (
              <div key={i} className="flex items-start gap-4 relative">
                {/* Vertical line */}
                {i < FLOW_STEPS.length - 1 && (
                  <div className="absolute left-[11px] top-7 bottom-0 w-px bg-white/[0.07]" />
                )}
                <div className="shrink-0 w-6 h-6 rounded-full bg-white/[0.08] border border-white/[0.14] flex items-center justify-center mt-0.5 shadow-[0_0_20px_rgba(255,255,255,0.03)]">
                  <span className="text-[10px] text-white/55 font-mono font-medium">
                    {step.num}
                  </span>
                </div>
                <p
                  className={`text-sm leading-relaxed pb-6 ${
                    step.dimmed ? "text-white/30 italic" : "text-white/55"
                  }`}
                >
                  {step.text}
                </p>
              </div>
            ))}
          </motion.div>

          {/* Right — Code + agent cloud */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.5, delay: 0.25, ease }}
            className="space-y-6"
          >
            {/* Code block */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#111] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                <span className="text-[11px] text-white/35 font-mono">
                  Quick install
                </span>
                <CopyButton text="npx @onrelay/wizard" />
              </div>
              <div className="px-4 py-4">
                <code className="text-[13px] font-mono text-white/65">
                  <span className="text-white/30">$</span>{" "}
                  npx @onrelay/wizard
                </code>
              </div>
            </div>

            {/* Agent cloud */}
            <div className="relative">
              <p className="text-[10px] tracking-[0.2em] font-medium text-white/25 uppercase mb-3">
                Supported agents
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MCP_AGENTS.map((agent) => (
                  <span
                    key={agent.name}
                    className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap ${
                      agent.tier === "primary"
                        ? "border-white/[0.1] bg-white/[0.04] text-white/55"
                        : "border-white/[0.06] bg-white/[0.02] text-white/35"
                    }`}
                  >
                    {agent.name}
                  </span>
                ))}
              </div>
              {/* Fade mask */}
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
