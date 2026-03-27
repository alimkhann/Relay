"use client"

import { motion, useInView } from "motion/react"
import { useCallback, useRef, useState } from "react"
import {
  Zap,
  FileText,
  Terminal,
  ArrowLeftRight,
  Play,
} from "lucide-react"
import { VideoModal } from "./video-modal"
import { trackMarketingEvent } from "./analytics"

import type { LucideIcon } from "lucide-react"

const ease = [0.25, 0.1, 0.25, 1] as const

const FEATURES = [
  {
    icon: Zap,
    label: "AUTO-CAPTURE",
    title: "Quietly saves what matters from every AI chat",
    description:
      "Work in ChatGPT, Claude, or Gemini. Relay captures decisions, tasks, and constraints automatically — no manual saving.",
    video: "/videos/auto-capture.mp4",
  },
  {
    icon: FileText,
    label: "PROJECT BRIEFS",
    title: "One-click context restoration in fresh chats",
    description:
      "Your project brief updates itself as you work. Open a new chat and inject the full context instantly.",
    video: "/videos/project-briefs.mp4",
  },
  {
    icon: Terminal,
    label: "MCP INTEGRATION",
    title: "Your coding agent reads and writes project memory",
    description:
      "Claude Code, Cursor, and any MCP-compatible agent connect directly. They share the same brief as your browser chats.",
    video: "/videos/mcp-integration.mp4",
  },
  {
    icon: ArrowLeftRight,
    label: "CROSS-SURFACE SYNC",
    title: "Decisions flow between tools automatically",
    description:
      "A choice made in ChatGPT surfaces in Cursor. A constraint set in Claude Code stays in sync with your next browser session.",
    video: "/videos/cross-surface-sync.mp4",
  },
]

/* ------------------------------------------------------------------ */
/*  Feature Card — video-first layout with hover-play + modal         */
/* ------------------------------------------------------------------ */

interface FeatureCardProps {
  feature: {
    icon: LucideIcon
    label: string
    title: string
    description: string
    video: string
  }
  inView: boolean
  index: number
}

function FeatureCard({ feature, inView, index }: FeatureCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true)
    videoRef.current?.play().catch(() => {})
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false)
    videoRef.current?.pause()
  }, [])

  const handleCardClick = useCallback(() => {
    setModalOpen(true)
    trackMarketingEvent("feature_video_opened", { feature: feature.label })
  }, [feature.label])

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{
          duration: 0.5,
          delay: 0.15 + index * 0.08,
          ease,
        }}
        className="rounded-2xl border border-white/[0.07] bg-[#111] overflow-hidden cursor-pointer group hover:border-white/[0.12] transition-colors duration-300"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleCardClick}
      >
        {/* Video — flush with card top edge */}
        <div className="aspect-video relative bg-black/40">
          <video
            ref={videoRef}
            src={feature.video}
            muted
            playsInline
            loop
            preload="metadata"
            className="w-full h-full object-cover"
          />
          {/* Play icon overlay — fades out on hover */}
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 pointer-events-none ${
              isHovering ? "opacity-0" : "opacity-100"
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/[0.12] flex items-center justify-center">
              <Play size={16} className="text-white/60 ml-0.5" fill="currentColor" />
            </div>
          </div>
        </div>

        {/* Text content */}
        <div className="p-5 md:p-6">
          {/* Icon + label on same line */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.07] flex items-center justify-center shrink-0">
              <feature.icon
                size={14}
                className="text-white/50"
                strokeWidth={1.5}
              />
            </div>
            <p className="text-[10px] tracking-[0.2em] font-medium text-transparent bg-clip-text bg-gradient-to-r from-white via-[#ededf2] to-[#b9bac4] uppercase">
              {feature.label}
            </p>
          </div>
          <h3 className="mt-2 text-base font-medium text-white/90 leading-snug">
            {feature.title}
          </h3>
          <p className="mt-2 text-sm text-white/45 leading-relaxed">
            {feature.description}
          </p>
        </div>
      </motion.div>

      <VideoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        videoSrc={feature.video}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Features Section                                                   */
/* ------------------------------------------------------------------ */

export function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section className="bg-[#0a0a0a] py-24 md:py-32 px-5" ref={ref}>
      <div className="mx-auto max-w-5xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="mb-10"
        >
          <p className="text-[10px] tracking-[0.2em] font-medium text-white/45 uppercase mb-4">
            What Relay does
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Context that moves with you
          </h2>
        </motion.div>

        {/* Launch video — auto-looping local MP4, click opens YouTube */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, delay: 0.05, ease }}
          className="mb-10"
        >
          <a
            href="https://youtu.be/15aqzManX-0"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackMarketingEvent("launch_video_clicked", {
                source: "features_section",
              })
            }
            className="block relative group rounded-2xl overflow-hidden border border-white/[0.07] hover:border-white/[0.14] transition-colors duration-300 aspect-video"
          >
            {/* Auto-looping launch video */}
            <video
              src="/videos/relay-launch.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none" />

            {/* Play button — glassy circle, visible on hover (always on mobile) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                <Play
                  size={28}
                  className="text-white ml-1"
                  fill="currentColor"
                />
              </div>
            </div>

            {/* Bottom label */}
            <div className="absolute bottom-4 left-4 pointer-events-none">
              <span className="text-xs font-medium text-white/60 group-hover:text-white/80 transition-colors">
                Watch the launch video
              </span>
            </div>
          </a>
        </motion.div>

        {/* Card grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {FEATURES.map((feature, i) => (
            <FeatureCard
              key={feature.label}
              feature={feature}
              inView={inView}
              index={i}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
