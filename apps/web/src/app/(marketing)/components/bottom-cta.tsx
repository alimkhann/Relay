"use client"

import Image from "next/image"
import Link from "next/link"
import { motion, useInView } from "motion/react"
import { useRef, useState } from "react"

import { trackMarketingEvent } from "./analytics"
import { pickOppositeLandingBackground, pickRandomLandingBackground } from "../background-images"
import { LANDING_COPY } from "../landing-copy"
import { useLandingCopyExperiment } from "@/lib/telemetry/use-landing-copy-experiment"

const ease = [0.25, 0.1, 0.25, 1] as const

export function BottomCta({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  const variant = useLandingCopyExperiment()
  const copy = LANDING_COPY[variant]
  const isVariantHeadline = variant === "variant"
  const [backgroundSrc] = useState(() =>
    pickOppositeLandingBackground(pickRandomLandingBackground()),
  )

  return (
    <section className="relative min-h-[85vh] flex items-center justify-center px-5" ref={ref}>
      {/* Background image */}
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src={backgroundSrc}
          alt=""
          fill
          quality={72}
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
          {isVariantHeadline ? (
            <>
              {copy.line1}
              <br />
            </>
          ) : (
            <>
              {copy.line1}
              <br />
              to{" "}
            </>
          )}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-[#f1f1f5] to-[#bfc0ca] [text-shadow:0_0_18px_rgba(255,255,255,0.14)]">
            {copy.line2Gradient}
          </span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.6, delay: 0.1, ease }}
          className="mt-6 text-base md:text-lg text-white/50 leading-relaxed max-w-xl mx-auto text-balance"
        >
          {copy.subheadLine1} {copy.subheadLine2} {copy.subheadLine3}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.6, delay: 0.2, ease }}
          className="mt-10"
        >
          <Link
            href={isLoggedIn ? "/dashboard" : "/get-started"}
            onClick={() => {
              trackMarketingEvent("get_started_clicked", { source: "bottom_cta" })
            }}
            className="inline-flex items-center gap-2 rounded-full bg-white text-[#0a0a0a] px-8 py-3.5 text-sm font-medium hover:bg-white/90 transition-colors duration-200"
          >
            {isLoggedIn ? "Go to Dashboard" : "Get started free"}
            <span className="text-xs">→</span>
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : undefined}
          transition={{ duration: 0.6, delay: 0.35, ease }}
          className="mt-5 text-xs text-white/25"
        >
          Free forever · No credit card · Takes 60 seconds
        </motion.p>
      </div>
    </section>
  )
}
