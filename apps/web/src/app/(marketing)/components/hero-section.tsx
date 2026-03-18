"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "motion/react"
import { LogoStrip } from "./logo-strip"
import { ChevronDown } from "lucide-react"

const ease = [0.25, 0.1, 0.25, 1] as const

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease },
  }),
}

export function HeroSection() {
  return (
    <section id="top" className="relative min-h-screen flex flex-col">
      {/* Background image */}
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src="/images/hero-bg.jpg"
          alt=""
          fill
          priority
          quality={90}
          className="object-cover object-center"
          sizes="100vw"
        />
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(10,10,10,0.3) 0%, rgba(10,10,10,0.85) 70%, rgba(10,10,10,1) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-5 pt-24 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-teal-400/20 bg-teal-400/[0.06] mb-8"
          >
            <span className="text-teal-400/80 text-xs">✦</span>
            <span className="text-xs tracking-wide text-teal-400/70 font-medium">
              Cross-AI context management
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            custom={0.1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.08] text-white"
          >
            Stop repeating yourself
            <br />
            to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-teal-500">
              every AI.
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            custom={0.2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-6 text-base md:text-lg text-white/50 leading-relaxed max-w-xl mx-auto"
          >
            Relay captures what matters from your AI chats and keeps a living
            project brief ready — so every fresh conversation starts exactly
            where you left off.
          </motion.p>

          {/* CTAs */}
          <motion.div
            custom={0.3}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link
              href="/get-started"
              className="inline-flex items-center gap-2 rounded-full bg-white text-[#0a0a0a] px-7 py-3 text-sm font-medium hover:bg-white/90 transition-colors duration-200"
            >
              Get Started
              <span className="text-xs">→</span>
            </Link>
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-7 py-3 text-sm font-medium text-white/70 hover:text-white hover:border-white/20 transition-all duration-200"
            >
              Read the docs
              <span className="text-xs">→</span>
            </a>
          </motion.div>

          {/* Microcopy */}
          <motion.p
            custom={0.4}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-5 text-xs text-white/25"
          >
            Chrome extension · MCP for your IDE · Free to start
          </motion.p>

          {/* Logo strip */}
          <LogoStrip />
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown size={18} className="text-white/20" />
        </motion.div>
      </motion.div>
    </section>
  )
}
