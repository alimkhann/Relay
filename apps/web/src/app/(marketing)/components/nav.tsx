"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/cn"
import { motion, AnimatePresence } from "motion/react"
import { ArrowRight, Menu, X } from "lucide-react"

const NAV_LINKS = [
  { label: "Home", href: "#top" },
  { label: "MCP", href: "#mcp" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "/docs", external: true },
]

export function Nav() {
  const [shaped, setShaped] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setShaped(window.scrollY > 20)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        <nav
          className={cn(
            "mx-auto grid grid-cols-[1fr_auto] md:grid-cols-[120px_1fr_120px] items-center transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] px-6 py-4 md:py-5 max-w-6xl border border-transparent bg-transparent",
            mobileOpen &&
              "max-md:bg-[#0a0a0a] max-md:border-b max-md:border-white/[0.06] max-md:backdrop-blur-xl",
            shaped &&
              "lg:mt-3 lg:max-w-3xl lg:rounded-[20px] lg:border-white/[0.08] lg:bg-white/[0.04] lg:px-4 lg:py-2 lg:backdrop-blur-2xl lg:shadow-[0_2px_24px_rgba(0,0,0,0.3)]"
          )}
        >
          {/* Logo — R mark only */}
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/images/relay_logo_white.png"
              alt="Relay"
              width={64}
              height={64}
              className={cn(
                "transition-all duration-500",
                shaped
                  ? "scale-[0.55] -ml-3"
                  : "scale-[0.65] drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
              )}
            />
          </Link>

          {/* Desktop nav links — center */}
          <div className="hidden md:flex items-center justify-center gap-7">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="text-[13px] text-white/45 hover:text-white/90 transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <Link
            href="/get-started"
            className={cn(
              "hidden md:inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold whitespace-nowrap shrink-0 transition-all duration-300",
              "bg-white text-[#0a0a0a] shadow-[0_2px_12px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:-translate-y-px"
            )}
          >
            Get started
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-white/70 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-[73px] bottom-0 z-40 bg-[#0a0a0a] backdrop-blur-xl border-b border-white/[0.06] md:hidden"
          >
            <div className="px-5 py-5 flex flex-col gap-5 min-h-full">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  {...(link.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="text-base text-white/60 hover:text-white transition-colors py-1"
                >
                  {link.label}
                </a>
              ))}
              <Link
                href="/get-started"
                onClick={() => setMobileOpen(false)}
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-white text-[#0a0a0a] px-5 py-2.5 text-sm font-medium"
              >
                Get Started →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
