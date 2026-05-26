"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { motion } from "motion/react"
import { LogoStrip } from "./logo-strip"
import { trackMarketingEvent } from "./analytics"
import { ChevronDown } from "lucide-react"
import { usePreloaderReady } from "./use-preloader-ready"
import { pickRandomLandingBackground } from "../background-images"
import { ChromeWebstoreBadge } from "@/components/chrome-webstore-badge"

const ease = [0.25, 0.1, 0.25, 1] as const

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease },
  }),
}

export function HeroSection({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const ready = usePreloaderReady()
  const [backgroundSrc] = useState(() => pickRandomLandingBackground())

  return (
    <section id="top" className="relative min-h-screen flex flex-col">
      {/* Background image */}
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src={backgroundSrc}
          alt=""
          fill
          priority
          quality={72}
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
        <div className="w-full max-w-4xl mx-auto text-center overflow-hidden">
          {/* Badge */}
          <motion.div
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate={ready ? "visible" : "hidden"}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/[0.12] bg-white/[0.04] mb-8"
          >
            <span className="text-white/60 text-xs">✦</span>
            <span className="text-xs tracking-wide text-white/50 font-medium">
              Cross-AI context management
            </span>
          </motion.div>

          {/* Headline — 2 lines */}
          <motion.h1
            custom={0.1}
            variants={fadeUp}
            initial="hidden"
            animate={ready ? "visible" : "hidden"}
            className="text-[2.15rem] sm:text-5xl md:text-7xl font-semibold tracking-tight leading-[1.02] text-white text-balance max-w-[11ch] sm:max-w-none mx-auto"
          >
            Stop repeating yourself
            <br className="hidden md:block" />
            <span className="md:hidden"> </span>
            to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-[#f1f1f5] to-[#bfc0ca] [text-shadow:0_0_18px_rgba(255,255,255,0.14)]">
              every AI
            </span>
          </motion.h1>

          {/* Subheadline — 2 lines desktop, 3 mobile */}
          <motion.p
            custom={0.2}
            variants={fadeUp}
            initial="hidden"
            animate={ready ? "visible" : "hidden"}
            className="mt-6 text-[14px] sm:text-base md:text-lg text-white/60 leading-relaxed max-w-[46rem] mx-auto px-2 sm:px-0"
          >
            Relay captures what matters from your AI chats and keeps a living project brief ready
            <br className="hidden md:block" /> — so every fresh conversation starts where you left off.
          </motion.p>

          {/* CTAs */}
          <motion.div
            custom={0.3}
            variants={fadeUp}
            initial="hidden"
            animate={ready ? "visible" : "hidden"}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <ChromeWebstoreBadge
              source="hero_primary"
              onClick={() => {
                trackMarketingEvent("add_to_chrome_clicked", { source: "hero_primary" })
              }}
              className="pl-4 pr-7 py-3"
            />
            <Link
              href={isLoggedIn ? "/dashboard" : "/get-started"}
              onClick={() => {
                trackMarketingEvent("get_started_clicked", { source: "hero_primary" })
              }}
              className="inline-flex items-center gap-2 rounded-full bg-white text-[#0a0a0a] shadow-[0_2px_12px_rgba(255,255,255,0.08)] px-7 py-3 text-sm font-semibold transition-all duration-300 ease-out hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(255,255,255,0.14)]"
            >
              {isLoggedIn ? "Dashboard" : "Get Started"}
              <span className="text-xs">→</span>
            </Link>
          </motion.div>

          {/* Social proof badges */}
          <motion.div
            custom={0.4}
            variants={fadeUp}
            initial="hidden"
            animate={ready ? "visible" : "hidden"}
            className="mt-6 flex items-center justify-center gap-4"
          >
            <a
              href="https://www.producthunt.com/products/relay-15?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-relay-c81c15ad-0524-4b02-919c-eb965efc036c"
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Relay - Stop repeating yourself to every AI | Product Hunt"
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1126723&theme=dark&t=1779707024093"
                height={44}
                style={{ height: 44, width: "auto" }}
              />
            </a>
            <a
              href="https://peerlist.io/alimkhan/project/relay--ai-memory--context-sync"
              target="_blank"
              rel="noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://peerlist.io/api/v1/projects/embed/PRJHNN7EKKAB8LBPNCOG6R9GR8LL68?showUpvote=true&theme=dark"
                alt="Relay — AI Memory & Context Sync"
                height={44}
                style={{ height: 44, width: "auto" }}
              />
            </a>
          </motion.div>

          {/* Microcopy */}
          <motion.p
            custom={0.5}
            variants={fadeUp}
            initial="hidden"
            animate={ready ? "visible" : "hidden"}
            className="mt-5 text-xs text-white/30"
          >
            Chrome extension · MCP for your IDE · Free to start
          </motion.p>

          {/* Logo strip */}
          <LogoStrip ready={ready} />
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={ready ? { opacity: 1 } : { opacity: 0 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown size={18} className="text-white/25" />
        </motion.div>
      </motion.div>
    </section>
  )
}
