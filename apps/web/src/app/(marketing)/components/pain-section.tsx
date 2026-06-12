"use client"

import { motion, useInView } from "motion/react"
import { useRef } from "react"
import { Clock, Layers, RotateCcw } from "lucide-react"
import { INTEGRATIONS_NEXT, INTEGRATIONS_TODAY } from "../marketing-integrations"

const ease = [0.25, 0.1, 0.25, 1] as const

const PAINS = [
  {
    icon: RotateCcw,
    title: "Every new chat starts from zero",
    body: "You re-explain your project, your stack, and your constraints to the same AI — again.",
  },
  {
    icon: Layers,
    title: "Your decisions live in five apps",
    body: "What you chose and why is buried across ChatGPT threads, Claude chats, and your editor.",
  },
  {
    icon: Clock,
    title: "Your AI forgets after every session",
    body: "The context you built up yesterday is gone today — for you and for your coding agents.",
  },
] as const

export function PainSection() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section className="bg-[#0a0a0a] px-5 py-20 md:py-24" ref={ref}>
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="mb-10 text-center md:text-left"
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">
            The problem
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Context doesn&apos;t survive the switch
          </h2>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-3">
          {PAINS.map((pain, index) => {
            const Icon = pain.icon
            return (
              <motion.div
                key={pain.title}
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.5, delay: 0.08 * index, ease }}
                className="group rounded-2xl border border-white/[0.07] border-l-2 border-l-white/20 bg-[#111] p-6 transition-transform duration-300 hover:-translate-y-0.5"
              >
                <Icon size={18} className="text-white/25" strokeWidth={1.5} />
                <h3 className="mt-3 text-base font-semibold text-white">{pain.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/45">{pain.body}</p>
              </motion.div>
            )
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.5, delay: 0.3, ease }}
          className="mt-10 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs text-white/35 md:justify-start">
            <span className="font-medium text-white/50">Works with</span>
            {INTEGRATIONS_TODAY.map((name) => (
              <span
                key={name}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1"
              >
                {name}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs md:justify-start">
            <span className="font-medium text-white/50">Coming soon</span>
            {INTEGRATIONS_NEXT.map((name) => (
              <span
                key={name}
                className="rounded-full border border-dashed border-white/[0.12] bg-white/[0.01] px-2.5 py-1 text-white/30"
              >
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}