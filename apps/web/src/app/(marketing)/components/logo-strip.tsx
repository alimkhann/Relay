"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/cn"

const BROWSER_TOOLS = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Grok",
  "Perplexity",
  "DeepSeek",
]

const MCP_TOOLS = [
  "Claude Code",
  "Cursor",
  "Codex",
  "Windsurf",
  "OpenCode",
  "Gemini CLI",
]

const pillClass =
  "px-3.5 py-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] text-[13px] text-white/55 whitespace-nowrap"

export function LogoStrip() {
  return (
    <div className="mt-14 flex flex-col items-center gap-6">
      {/* Browser tools */}
      <div className="flex flex-col items-center gap-3">
        <span className="text-[10px] tracking-[0.2em] font-medium text-white/30 uppercase">
          Works with
        </span>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.06 } },
          }}
          className="flex flex-wrap justify-center gap-2"
        >
          {BROWSER_TOOLS.map((tool) => (
            <motion.span
              key={tool}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
                },
              }}
              className={pillClass}
            >
              {tool}
            </motion.span>
          ))}
        </motion.div>
      </div>

      {/* MCP tools */}
      <div className="flex flex-col items-center gap-3">
        <span className="text-[10px] tracking-[0.2em] font-medium text-white/30 uppercase">
          Via MCP
        </span>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: { staggerChildren: 0.06, delayChildren: 0.3 },
            },
          }}
          className="flex flex-wrap justify-center gap-2"
        >
          {MCP_TOOLS.map((tool) => (
            <motion.span
              key={tool}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
                },
              }}
              className={pillClass}
            >
              {tool}
            </motion.span>
          ))}
          <motion.a
            href="#mcp"
            variants={{
              hidden: { opacity: 0, y: 8 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
              },
            }}
            className={cn(
              pillClass,
              "border-white/[0.15] text-white/40 hover:text-white/70 hover:border-white/25 transition-colors cursor-pointer"
            )}
          >
            more
          </motion.a>
        </motion.div>
      </div>
    </div>
  )
}
