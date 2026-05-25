"use client"

import { cn } from "@/lib/cn"
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
import type { ReactNode } from "react"
import { motion, useInView } from "motion/react"
import { useRef } from "react"

interface TickerItem {
  name: string
  icon: ReactNode
}

const BROWSER_AIS: TickerItem[] = [
  { name: "ChatGPT", icon: <OpenAI size={18} /> },
  { name: "Claude", icon: <Claude size={18} /> },
  { name: "Gemini", icon: <Gemini size={18} /> },
  { name: "Grok", icon: <Grok size={18} /> },
  { name: "Perplexity", icon: <Perplexity size={18} /> },
  { name: "DeepSeek", icon: <DeepSeek size={18} /> },
]

const MCP_AGENTS: TickerItem[] = [
  { name: "Claude Code", icon: <ClaudeCode size={18} /> },
  { name: "Cursor", icon: <Cursor size={18} /> },
  { name: "Codex", icon: <Codex size={18} /> },
  { name: "Antigravity", icon: <Antigravity size={18} /> },
  { name: "Windsurf", icon: <Windsurf size={18} /> },
  { name: "GitHub Copilot", icon: <GithubCopilot size={18} /> },
]

function LogoTicker({
  items,
  direction = "left",
  speed = "normal",
  label,
  className,
}: {
  items: TickerItem[]
  direction?: "left" | "right"
  speed?: "slow" | "normal" | "fast"
  label: string
  className?: string
}) {
  const duration = speed === "slow" ? "40s" : speed === "fast" ? "15s" : "25s"

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <span className="text-[10px] tracking-[0.2em] font-medium text-white/30 uppercase">
        {label}
      </span>
      <div
        className="relative w-[calc(100vw-2.5rem)] sm:w-full max-w-2xl overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
        }}
      >
        <div
          className="flex w-max gap-3"
          style={{
            animation: `ticker ${duration} linear infinite ${direction === "right" ? "reverse" : ""}`,
          }}
        >
          {[...items, ...items, ...items].map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] whitespace-nowrap"
            >
              <span className="text-white/50 w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center">
                {item.icon}
              </span>
              <span className="text-[12px] sm:text-[13px] text-white/55 font-medium">
                {item.name}
              </span>
            </div>
          ))}
        </div>

        <style jsx>{`
          @keyframes ticker {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-33.333%);
            }
          }
        `}</style>
      </div>
    </div>
  )
}

export function LogoStrip({ ready = true }: { ready?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={ready && inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.55, delay: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
      className="mt-14 flex flex-col items-center gap-6 w-full"
    >
      <LogoTicker
        items={BROWSER_AIS}
        direction="left"
        speed="slow"
        label="Works with"
      />
    </motion.div>
  )
}
