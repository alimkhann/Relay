"use client"

import Image from "next/image"
import Link from "next/link"
import { motion, useInView } from "motion/react"
import { useRef } from "react"

const ease = [0.25, 0.1, 0.25, 1] as const

export function BottomCta() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section className="relative min-h-[85vh] flex items-center justify-center px-5" ref={ref}>
      {/* Background image */}
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src="/images/hero-bg.jpg"
          alt=""
          fill
          quality={80}
          className="object-cover object-center"
          sizes="100vw"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, #0a0a0a 0%, rgba(10,10,10,0.4) 40%, rgba(10,10,10,0.6) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative text-center max-w-2xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.6, ease }}
          className="text-4xl md:text-6xl font-semibold tracking-tight text-white leading-[1.1]"
        >
          Stop repeating yourself
          <br />
          to every AI.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.6, delay: 0.1, ease }}
          className="mt-6 text-base md:text-lg text-white/45 leading-relaxed max-w-xl mx-auto"
        >
          Relay keeps your project context ready so every fresh chat starts
          where you left off — across every tool you use.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.6, delay: 0.2, ease }}
          className="mt-10"
        >
          <Link
            href="/get-started"
            className="inline-flex items-center gap-2 rounded-full bg-white text-[#0a0a0a] px-8 py-3.5 text-sm font-medium hover:bg-white/90 transition-colors duration-200"
          >
            Get started free
            <span className="text-xs">→</span>
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.6, delay: 0.35, ease }}
          className="mt-5 text-xs text-white/20"
        >
          Free forever · No credit card · Takes 60 seconds
        </motion.p>
      </div>
    </section>
  )
}
