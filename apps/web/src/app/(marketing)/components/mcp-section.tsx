"use client"

import { motion, useInView } from "motion/react"
import { useRef, useState } from "react"
import { Copy, Check } from "lucide-react"
import { MCP_AGENTS } from "../mcp-agents.config"

const ease = [0.25, 0.1, 0.25, 1] as const
const WIZARD_COMMAND = "npx @onrelay/wizard"

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
      className="rounded-md p-1.5 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/60"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-emerald-400/80" /> : <Copy size={14} />}
    </button>
  )
}

export function McpSection({ standalone = false }: { standalone?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section
      id={standalone ? undefined : "mcp"}
      className={`bg-[#0a0a0a] px-5 ${standalone ? "pb-24 pt-8 md:pb-32" : "py-24 md:py-32"}`}
      ref={ref}
    >
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="mb-10 grid gap-8 lg:grid-cols-2 lg:items-end lg:gap-10"
        >
          <div>
            {!standalone ? (
              <>
                <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">
                  MCP Integration
                </p>
                <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white md:text-4xl">
                  Your coding agent,
                  <br />
                  fully in the loop
                </h2>
              </>
            ) : null}
            <p className={`max-w-md text-base leading-relaxed text-white/50 ${standalone ? "" : "mt-4"}`}>
              MCP (Model Context Protocol) is an open standard that lets AI agents read and write
              structured memory. Relay implements it as a bridge between your browser sessions and
              any IDE agent.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.5, delay: 0.1, ease }}
            className="w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <span className="font-mono text-[11px] text-white/35">Quick install</span>
              <CopyButton text={WIZARD_COMMAND} />
            </div>
            <div className="px-5 py-5">
              <code className="font-mono text-sm text-white/65 md:text-[15px]">
                <span className="text-white/30">$</span> {WIZARD_COMMAND}
              </code>
            </div>
          </motion.div>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2 md:gap-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.5, delay: 0.15, ease }}
            className="space-y-0"
          >
            {FLOW_STEPS.map((step, i) => (
              <div key={i} className="relative flex items-start gap-4">
                {i < FLOW_STEPS.length - 1 && (
                  <div className="absolute bottom-0 left-[11px] top-7 w-px bg-white/[0.07]" />
                )}
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.08] shadow-[0_0_20px_rgba(255,255,255,0.03)]">
                  <span className="font-mono text-[10px] font-medium text-white/55">{step.num}</span>
                </div>
                <p
                  className={`pb-6 text-sm leading-relaxed ${
                    step.dimmed ? "italic text-white/30" : "text-white/55"
                  }`}
                >
                  {step.text}
                </p>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.5, delay: 0.25, ease }}
            className="relative"
          >
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-white/25">
              Supported agents
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MCP_AGENTS.map((agent) => (
                <span
                  key={agent.name}
                  className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
                    agent.tier === "primary"
                      ? "border-white/[0.1] bg-white/[0.04] text-white/55"
                      : "border-white/[0.06] bg-white/[0.02] text-white/35"
                  }`}
                >
                  {agent.name}
                </span>
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}