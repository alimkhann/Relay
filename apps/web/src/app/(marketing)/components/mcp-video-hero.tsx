"use client"

import Image from "next/image"
import { motion, useInView } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import { Play } from "lucide-react"
import { OnboardingMarquee } from "./onboarding-marquee"
import { VideoModal } from "./video-modal"
import { trackMarketingEvent } from "./analytics"

const ease = [0.25, 0.1, 0.25, 1] as const

const MCP_VIDEO = {
  poster: "/images/video-posters/mcp-integration.webp",
  previewMp4: "/videos/mcp-integration.mp4",
  previewWebm: "/videos/mcp-integration.webm",
}

function useElementSeen(ref: RefObject<Element | null>, rootMargin = "240px") {
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element || seen) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold: 0.01 },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, rootMargin, seen])

  return seen
}

export function McpVideoHero() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: "-80px" })
  const shouldLoadPreview = useElementSeen(cardRef, "240px")
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !shouldLoadPreview) return
    void video.play().catch(() => {})
  }, [shouldLoadPreview])

  const handleClick = useCallback(() => {
    setModalOpen(true)
    trackMarketingEvent("feature_video_opened", { feature: "MCP INTEGRATION", source: "mcp_page" })
  }, [])

  return (
    <>
      <section className="relative overflow-hidden pb-10 pt-28 md:pb-14 md:pt-32" ref={sectionRef}>
        <div className="relative z-10 mx-auto max-w-5xl px-5">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.5, ease }}
            className="relative mb-8 text-center"
          >
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">
              MCP Integration
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Your coding agent, fully in the loop
            </h1>
          </motion.div>

          <div className="relative">
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 w-screen -translate-x-1/2 -translate-y-1/2">
              <OnboardingMarquee fullBleed />
            </div>

            <motion.button
              ref={cardRef}
              type="button"
              onClick={handleClick}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.5, delay: 0.08, ease }}
              className="group relative z-10 block aspect-video w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0a0a]/50 text-left shadow-[0_24px_80px_rgba(0,0,0,0.5)] transition-colors duration-300 hover:border-white/[0.14]"
            >
            <Image
              src={MCP_VIDEO.poster}
              alt=""
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.01]"
              sizes="(min-width: 1024px) 1024px, 100vw"
            />
            {shouldLoadPreview ? (
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                poster={MCP_VIDEO.poster}
                muted
                loop
                playsInline
                preload="none"
                aria-hidden="true"
                tabIndex={-1}
              >
                <source src={MCP_VIDEO.previewWebm} type="video/webm" />
                <source src={MCP_VIDEO.previewMp4} type="video/mp4" />
              </video>
            ) : null}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-[0_0_40px_rgba(255,255,255,0.1)] backdrop-blur-md transition-opacity duration-300 md:h-20 md:w-20 ${
                  shouldLoadPreview ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                }`}
              >
                <Play size={28} className="ml-1 text-white" fill="currentColor" />
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-4 left-4">
              <span className="text-xs font-medium text-white/60 transition-colors group-hover:text-white/80">
                Watch MCP integration
              </span>
            </div>
            </motion.button>
          </div>
        </div>
      </section>

      <VideoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        videoMp4={MCP_VIDEO.previewMp4}
        videoWebm={MCP_VIDEO.previewWebm}
        poster={MCP_VIDEO.poster}
      />
    </>
  )
}