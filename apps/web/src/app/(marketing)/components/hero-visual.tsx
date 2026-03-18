"use client"

import { motion, useInView } from "motion/react"
import { useRef } from "react"

const ease = [0.25, 0.1, 0.25, 1] as const

export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section className="relative bg-[#0a0a0a] py-8 md:py-16 px-5" ref={ref}>
      {/* Ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div className="w-[700px] h-[400px] rounded-full bg-teal-500/[0.04] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
          {/* Left panel — Browser chat */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.7, ease }}
            className="rounded-2xl border border-white/[0.06] bg-[#111] overflow-hidden"
          >
            {/* Chrome bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#0d0d0d]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
              </div>
              <div className="flex-1 mx-3">
                <div className="bg-white/[0.04] rounded-md px-3 py-1 text-[11px] text-white/30 font-mono">
                  chatgpt.com
                </div>
              </div>
            </div>

            {/* Label */}
            <div className="px-4 pt-3">
              <span className="text-[10px] tracking-[0.15em] font-medium text-white/20 uppercase">
                Browser chat
              </span>
            </div>

            {/* Chat content */}
            <div className="px-4 py-3 space-y-3">
              {/* User message */}
              <div className="flex justify-end">
                <div className="bg-white/[0.06] rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%]">
                  <p className="text-[13px] text-white/70 leading-relaxed">
                    Let&apos;s continue building the auth flow. We decided to
                    use Supabase and the user table needs...
                  </p>
                </div>
              </div>

              {/* AI response (partial) */}
              <div className="flex justify-start">
                <div className="bg-white/[0.03] rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%]">
                  <p className="text-[13px] text-white/50 leading-relaxed">
                    I&apos;ll help with the auth flow. Based on the Supabase
                    setup, we should first define the user table schema with
                    RLS&nbsp;policies...
                  </p>
                </div>
              </div>

              {/* Relay chip */}
              <div className="flex items-center gap-2 pt-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-400/[0.08] border border-teal-400/20">
                  <span className="text-[11px]">📎</span>
                  <span className="text-[11px] text-teal-400/80 font-medium">
                    Relay · My App Project
                  </span>
                </div>
              </div>
            </div>

            {/* Toast */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={inView ? { opacity: 1, x: 0 } : undefined}
              transition={{ duration: 0.4, delay: 0.8, ease }}
              className="mx-4 mb-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-400/[0.08] border border-teal-400/15"
            >
              <span className="text-teal-400 text-xs">✓</span>
              <span className="text-[11px] text-teal-400/70">
                Context saved to My App Project
              </span>
            </motion.div>
          </motion.div>

          {/* Divider line — visible on desktop only */}
          <div className="hidden md:block absolute left-1/2 top-[15%] bottom-[15%] w-px -translate-x-1/2 z-10">
            <div className="h-full w-full bg-gradient-to-b from-transparent via-teal-400/20 to-transparent" />
          </div>

          {/* Right panel — IDE agent */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.7, delay: 0.15, ease }}
            className="rounded-2xl border border-white/[0.06] bg-[#111] overflow-hidden"
          >
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#0d0d0d]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
              </div>
              <span className="text-[11px] text-white/30 font-mono ml-3">
                Claude Code
              </span>
            </div>

            {/* Label */}
            <div className="px-4 pt-3">
              <span className="text-[10px] tracking-[0.15em] font-medium text-white/20 uppercase">
                IDE agent (via MCP)
              </span>
            </div>

            {/* Terminal content */}
            <div className="px-4 py-3 font-mono text-[12px] leading-relaxed space-y-3">
              {/* MCP call */}
              <div>
                <p className="text-white/30">
                  <span className="text-teal-400/60">→</span>{" "}
                  relay_get_brief(
                  <span className="text-white/50">
                    &quot;My App Project&quot;
                  </span>
                  )
                </p>
                <p className="text-teal-400/50 mt-1">
                  ✓ Loaded project brief
                </p>
              </div>

              {/* Brief content */}
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2.5 space-y-1.5">
                <p className="text-white/40">
                  <span className="text-blue-400/50 font-medium">
                    Decisions:
                  </span>{" "}
                  Supabase for auth, PostgreSQL...
                </p>
                <p className="text-white/40">
                  <span className="text-emerald-400/50 font-medium">
                    Tasks:
                  </span>{" "}
                  Implement auth flow, add RLS policies...
                </p>
                <p className="text-white/40">
                  <span className="text-amber-400/50 font-medium">
                    Constraints:
                  </span>{" "}
                  No third-party auth providers
                </p>
              </div>

              {/* Code suggestion */}
              <div className="mt-2">
                <p className="text-white/30 mb-1.5">
                  Based on the brief, implementing RLS:
                </p>
                <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2.5">
                  <p className="text-white/30">
                    <span className="text-purple-400/50">CREATE POLICY</span>{" "}
                    <span className="text-white/40">
                      &quot;users_own_data&quot;
                    </span>
                  </p>
                  <p className="text-white/30">
                    {"  "}
                    <span className="text-purple-400/50">ON</span> public.users
                  </p>
                  <p className="text-white/30">
                    {"  "}
                    <span className="text-purple-400/50">USING</span> (auth.uid()
                    = id);
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
