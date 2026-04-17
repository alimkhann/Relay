"use client"

import { motion, useInView } from "motion/react"
import { useRef } from "react"
import { Send } from "lucide-react"
import OpenAI from "@lobehub/icons/es/OpenAI"
import ClaudeCode from "@lobehub/icons/es/ClaudeCode"

const ease = [0.25, 0.1, 0.25, 1] as const

/* ─── Typing animation characters ─── */
const INPUT_TEXT = "Let's continue building the auth flow..."
const USER_TEXT = "Let's continue building the auth flow. We decided to use Supabase and the user table needs..."
const AI_TEXT = "I'll help with the auth flow. Based on the Supabase setup, we should first define the user table schema with RLS\u00a0policies..."

function TypingText({ text, delayMs, className }: { text: string; delayMs: number; className?: string }) {
  return (
    <span className={className}>
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delayMs / 1000 + i * 0.018, duration: 0.01 }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  )
}

/* ─── Input bar typing: shows chars appearing then clears ─── */
function InputTyping({ text, startDelay, inView }: { text: string; startDelay: number; inView: boolean }) {
  const charDuration = 0.018
  const totalTypingTime = text.length * charDuration

  return (
    <span className="text-[13px] text-white/55 flex-1 relative">
      {/* Typing characters */}
      {inView ? text.split("").map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{
            delay: startDelay + i * charDuration,
            duration: 0.6,
            times: [0, 0.05, 0.8, 1],
            // All chars disappear together when "sent"
            ease: "linear",
          }}
        >
          {char}
        </motion.span>
      )) : null}
      {/* Placeholder shown before typing starts */}
      <motion.span
        className="absolute inset-0 text-white/25"
        initial={{ opacity: 1 }}
        animate={inView ? { opacity: 0 } : undefined}
        transition={{ delay: startDelay, duration: 0.1 }}
      >
        Message ChatGPT...
      </motion.span>
      {/* Blinking cursor during typing */}
      {inView ? (
        <motion.span
          className="inline-block w-px h-[14px] bg-white/50 align-middle ml-px"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{
            delay: startDelay,
            duration: totalTypingTime + 0.4,
            times: [0, 0.02, 0.9, 1],
          }}
        />
      ) : null}
    </span>
  )
}

export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section className="relative bg-[#0a0a0a] py-10 md:py-20 px-5" ref={ref}>
      {/* Ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div className="w-[900px] h-[560px] rounded-full bg-white/[0.035] blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          {/* Left panel — Browser chat */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.7, ease }}
            className="relative rounded-2xl border border-white/[0.08] bg-[#111] overflow-hidden flex flex-col"
          >
            {/* Toast — appears after typing completes */}
            <motion.div
              initial={{ opacity: 0, y: -10, x: 10, scale: 0.95 }}
              animate={inView ? { opacity: 1, y: 0, x: 0, scale: 1 } : undefined}
              transition={{ duration: 0.4, delay: 3.2, ease }}
              className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1a1a]/95 border border-white/[0.08] shadow-lg backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={inView ? { scale: 1 } : undefined}
                transition={{ delay: 3.4, duration: 0.3, type: "spring" }}
                className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center"
              >
                <span className="text-emerald-400 text-[9px]">✓</span>
              </motion.div>
              <div>
                <p className="text-[10px] font-medium text-white/70">Saving to Relay</p>
                <p className="text-[9px] text-white/35">My App Project</p>
              </div>
            </motion.div>

            {/* Chrome bar — colored dots */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#0d0d0d]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 mx-3">
                <div className="bg-white/[0.04] rounded-md px-3 py-1 text-[11px] text-white/35 font-mono flex items-center gap-1.5">
                  <OpenAI size={12} />
                  <span>chatgpt.com</span>
                </div>
              </div>
            </div>

            {/* Label */}
            <div className="px-5 pt-4">
              <span className="text-[10px] tracking-[0.15em] font-medium text-white/25 uppercase">
                Browser chat
              </span>
            </div>

            {/* Chat content with typing animation */}
            <div className="px-5 py-4 space-y-3.5 flex-1">
              {/* User message — appears after input typing + send */}
              <motion.div
                className="flex justify-end"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : undefined}
                transition={{ delay: 1.5, duration: 0.2 }}
              >
                <div className="bg-white/[0.06] rounded-2xl rounded-br-md px-4 py-3 max-w-[85%]">
                  <p className="text-[13px] text-white/70 leading-relaxed">
                    {inView ? (
                      <TypingText text={USER_TEXT} delayMs={1600} className="text-white/70" />
                    ) : USER_TEXT}
                  </p>
                </div>
              </motion.div>

              {/* AI response — streams in after user message */}
              <motion.div
                className="flex justify-start"
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : undefined}
                transition={{ delay: 2.6, duration: 0.2 }}
              >
                <div className="bg-white/[0.03] rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
                  <p className="text-[13px] text-white/55 leading-relaxed">
                    {inView ? (
                      <TypingText text={AI_TEXT} delayMs={2700} className="text-white/55" />
                    ) : AI_TEXT}
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Chat input mock with animated typing then send */}
            <div className="px-5 pb-4 mt-auto">
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5">
                <InputTyping text={INPUT_TEXT} startDelay={0.6} inView={inView} />
                <motion.div
                  animate={inView ? {
                    scale: [1, 1.15, 1],
                    opacity: [0.2, 0.6, 0.2],
                  } : undefined}
                  transition={{ delay: 1.3, duration: 0.3 }}
                >
                  <Send size={14} className="text-white/20" />
                </motion.div>
              </div>
            </div>
          </motion.div>

          {/* Divider line — visible on desktop only */}
          <div className="hidden md:block absolute left-1/2 top-[12%] bottom-[12%] w-px -translate-x-1/2 z-10">
            <div className="h-full w-full bg-gradient-to-b from-transparent via-white/10 to-transparent" />
          </div>

          {/* Right panel — IDE agent */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.7, delay: 0.15, ease }}
            className="rounded-2xl border border-white/[0.08] bg-[#111] overflow-hidden"
          >
            {/* Window chrome — colored dots */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#0d0d0d]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <span className="text-[11px] text-white/35 font-mono ml-3 flex items-center gap-1.5">
                <ClaudeCode size={12} />
                <span>Claude Code</span>
              </span>
            </div>

            {/* Label */}
            <div className="px-5 pt-4">
              <span className="text-[10px] tracking-[0.15em] font-medium text-white/25 uppercase">
                IDE agent (via MCP)
              </span>
            </div>

            {/* Terminal content — appears after toast */}
            <div className="px-5 py-4 font-mono text-[12.5px] leading-relaxed space-y-3.5">
              {/* MCP call */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : undefined}
                transition={{ delay: 3.6, duration: 0.3 }}
              >
                <p className="text-white/40">
                  <span className="text-white/50">→</span>{" "}
                  get_brief(
                  <span className="text-white/60">
                    &quot;My App Project&quot;
                  </span>
                  )
                </p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : undefined}
                  transition={{ delay: 4.0, duration: 0.3 }}
                  className="text-emerald-400/60 mt-1"
                >
                  ✓ Loaded project brief
                </motion.p>
              </motion.div>

              {/* Brief content — cascades in */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={inView ? { opacity: 1, y: 0 } : undefined}
                transition={{ delay: 4.3, duration: 0.4, ease }}
                className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-3.5 py-3 space-y-1.5"
              >
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : undefined}
                  transition={{ delay: 4.5, duration: 0.2 }}
                  className="text-white/50"
                >
                  <span className="text-blue-400/60 font-medium">
                    Decisions:
                  </span>{" "}
                  Supabase for auth, PostgreSQL...
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : undefined}
                  transition={{ delay: 4.7, duration: 0.2 }}
                  className="text-white/50"
                >
                  <span className="text-emerald-400/60 font-medium">
                    Tasks:
                  </span>{" "}
                  Implement auth flow, add RLS policies...
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : undefined}
                  transition={{ delay: 4.9, duration: 0.2 }}
                  className="text-white/50"
                >
                  <span className="text-amber-400/60 font-medium">
                    Constraints:
                  </span>{" "}
                  No third-party auth providers
                </motion.p>
              </motion.div>

              {/* Code suggestion */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={inView ? { opacity: 1, y: 0 } : undefined}
                transition={{ delay: 5.2, duration: 0.4, ease }}
                className="mt-2"
              >
                <p className="text-white/35 mb-1.5">
                  Based on the brief, implementing RLS:
                </p>
                <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-3.5 py-3">
                  <p className="text-white/40">
                    <span className="text-purple-400/60">CREATE POLICY</span>{" "}
                    <span className="text-white/50">
                      &quot;users_own_data&quot;
                    </span>
                  </p>
                  <p className="text-white/40">
                    {"  "}
                    <span className="text-purple-400/60">ON</span> public.users
                  </p>
                  <p className="text-white/40">
                    {"  "}
                    <span className="text-purple-400/60">USING</span> (auth.uid()
                    = id);
                  </p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
