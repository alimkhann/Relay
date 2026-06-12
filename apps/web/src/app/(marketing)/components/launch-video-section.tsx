"use client"

import Image from "next/image"
import { motion, useInView } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import { Play } from "lucide-react"
import { trackMarketingEvent } from "./analytics"

const ease = [0.25, 0.1, 0.25, 1] as const

const LAUNCH_VIDEO = {
  href: "https://youtu.be/15aqzManX-0",
  poster: "/images/video-posters/relay-launch.webp",
  previewMp4: "/videos/relay-launch-preview.mp4",
  previewWebm: "/videos/relay-launch-preview.webm",
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

export function LaunchVideoSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLAnchorElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: "-80px" })
  const shouldLoadPreview = useElementSeen(cardRef, "240px")

  useEffect(() => {
    const video = videoRef.current
    if (!video || !shouldLoadPreview) return
    void video.play().catch(() => {})
  }, [shouldLoadPreview])

  const handleClick = useCallback(() => {
    trackMarketingEvent("launch_video_clicked", { source: "launch_video_section" })
  }, [])

  return (
    <section className="bg-[#0a0a0a] px-5 pb-8 pt-4 md:pb-12" ref={sectionRef}>
      <div className="mx-auto max-w-5xl">
        <motion.a
          ref={cardRef}
          href={LAUNCH_VIDEO.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="group relative block aspect-video overflow-hidden rounded-2xl border border-white/[0.07] transition-colors duration-300 hover:border-white/[0.14]"
        >
          <Image
            src={LAUNCH_VIDEO.poster}
            alt=""
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.01]"
            sizes="(min-width: 1024px) 1024px, 100vw"
          />
          {shouldLoadPreview ? (
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              poster={LAUNCH_VIDEO.poster}
              muted
              loop
              playsInline
              preload="none"
              aria-hidden="true"
              tabIndex={-1}
            >
              <source src={LAUNCH_VIDEO.previewWebm} type="video/webm" />
              <source src={LAUNCH_VIDEO.previewMp4} type="video/mp4" />
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
              Watch the launch video
            </span>
          </div>
        </motion.a>
      </div>
    </section>
  )
}