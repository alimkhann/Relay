"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const threshold = window.innerHeight * 0.3
      setScrolled(window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out ${
        scrolled
          ? "bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between transition-all duration-500 ${
          scrolled ? "px-6 py-2.5 lg:px-10" : "px-6 py-5 lg:px-10 lg:py-6"
        }`}
        data-animate="nav"
      >
        <Link href="/" className="flex items-center">
          <Image
            src="/images/relay_logo_white.png"
            alt="Relay"
            width={28}
            height={28}
            className={`transition-all duration-500 ${scrolled ? "brightness-0 scale-90" : "drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"}`}
          />
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          <a
            className={`transition-colors duration-300 ${
              scrolled ? "text-gray-400 hover:text-gray-900" : "text-white/60 hover:text-white"
            }`}
            href="#how-it-works"
          >
            How it works
          </a>
          <a
            className={`transition-colors duration-300 ${
              scrolled ? "text-gray-400 hover:text-gray-900" : "text-white/60 hover:text-white"
            }`}
            href="#faq"
          >
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            className={`hidden text-sm font-medium transition-colors duration-300 sm:inline ${
              scrolled ? "text-gray-400 hover:text-gray-900" : "text-white/60 hover:text-white"
            }`}
            href="/sign-in"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 ${
              scrolled
                ? "bg-[#111210] text-white shadow-sm hover:bg-[#2a2d2a] hover:shadow-md"
                : "bg-white text-[#111210] shadow-[0_2px_12px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.25)] hover:-translate-y-px"
            }`}
          >
            Get started
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  )
}
