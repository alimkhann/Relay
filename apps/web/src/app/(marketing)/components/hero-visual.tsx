"use client"

import { motion, useInView } from "motion/react"
import { useRef } from "react"
import { Send } from "lucide-react"

const ease = [0.25, 0.1, 0.25, 1] as const

export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section className="relative bg-[#0a0a0a] py-10 md:py-20 px-5" ref={ref}>
      {/* Ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div className="w-[800px] h-[500px] rounded-full bg-white/[0.015] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          {/* Left panel — Browser chat */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.7, ease }}
            className="relative rounded-2xl border border-white/[0.08] bg-[#111] overflow-hidden"
          >
            {/* Toast — top right corner */}
            <motion.div
              initial={{ opacity: 0, y: -10, x: 10 }}
              animate={inView ? { opacity: 1, y: 0, x: 0 } : undefined}
              transition={{ duration: 0.4, delay: 1.0, ease }}
              className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1a1a]/95 border border-white/[0.08] shadow-lg backdrop-blur-sm"
            >
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <span className="text-emerald-400 text-[9px]">✓</span>
              </div>
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
                <div className="bg-white/[0.04] rounded-md px-3 py-1 text-[11px] text-white/35 font-mono">
                  chatgpt.com
                </div>
              </div>
            </div>

            {/* Label */}
            <div className="px-5 pt-4">
              <span className="text-[10px] tracking-[0.15em] font-medium text-white/25 uppercase">
                Browser chat
              </span>
            </div>

            {/* Chat content */}
            <div className="px-5 py-4 space-y-3.5">
              {/* User message */}
              <div className="flex justify-end">
                <div className="bg-white/[0.06] rounded-2xl rounded-br-md px-4 py-3 max-w-[85%]">
                  <p className="text-[13px] text-white/70 leading-relaxed">
                    Let&apos;s continue building the auth flow. We decided to
                    use Supabase and the user table needs...
                  </p>
                </div>
              </div>

              {/* AI response (partial) */}
              <div className="flex justify-start">
                <div className="bg-white/[0.03] rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
                  <p className="text-[13px] text-white/55 leading-relaxed">
                    I&apos;ll help with the auth flow. Based on the Supabase
                    setup, we should first define the user table schema with
                    RLS&nbsp;policies...
                  </p>
                </div>
              </div>
            </div>

            {/* Chat input mock */}
            <div className="px-5 pb-4">
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5">
                <span className="text-[13px] text-white/25 flex-1">Message ChatGPT...</span>
                <Send size={14} className="text-white/20" />
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
              <span className="text-[11px] text-white/35 font-mono ml-3">
                Claude Code
              </span>
            </div>

            {/* Label */}
            <div className="px-5 pt-4">
              <span className="text-[10px] tracking-[0.15em] font-medium text-white/25 uppercase">
                IDE agent (via MCP)
              </span>
            </div>

            {/* Terminal content */}
            <div className="px-5 py-4 font-mono text-[12.5px] leading-relaxed space-y-3.5">
              {/* MCP call */}
              <div>
                <p className="text-white/40">
                  <span className="text-white/50">→</span>{" "}
                  relay_get_brief(
                  <span className="text-white/60">
                    &quot;My App Project&quot;
                  </span>
                  )
                </p>
                <p className="text-emerald-400/60 mt-1">
                  ✓ Loaded project brief
                </p>
              </div>

              {/* Brief content */}
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-3.5 py-3 space-y-1.5">
                <p className="text-white/50">
                  <span className="text-blue-400/60 font-medium">
                    Decisions:
                  </span>{" "}
                  Supabase for auth, PostgreSQL...
                </p>
                <p className="text-white/50">
                  <span className="text-emerald-400/60 font-medium">
                    Tasks:
                  </span>{" "}
                  Implement auth flow, add RLS policies...
                </p>
                <p className="text-white/50">
                  <span className="text-amber-400/60 font-medium">
                    Constraints:
                  </span>{" "}
                  No third-party auth providers
                </p>
              </div>

              {/* Code suggestion */}
              <div className="mt-2">
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
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
