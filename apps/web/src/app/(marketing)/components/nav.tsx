"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/cn"
import { trackMarketingEvent } from "./analytics"
import {
  motion,
  AnimatePresence,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react"
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react"
import { usePathname } from "next/navigation"
import { ChromeWebstoreBadge } from "@/components/chrome-webstore-badge"
import { docsHref } from "@/components/docs/docs-back-link"

const NAV_LINKS = [
  { label: "Home", href: "#top", homeAware: true },
  { label: "MCP", href: "/mcp" },
  { label: "Pricing", href: "/pricing" },
  { label: "Blog", href: "/blog" },
  { label: "Docs", href: docsHref("landing"), external: true },
]

export function Nav({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const pathname = usePathname()
  const onMarketingHome = pathname === "/"
  const [shaped, setShaped] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const { scrollY } = useScroll()
  const morph = useSpring(useTransform(scrollY, [0, 80], [0, 1]), {
    stiffness: 180,
    damping: 26,
    mass: 0.7,
  })

  const maxWidth = useTransform(morph, [0, 1], [1152, 768])
  const marginTop = useTransform(morph, [0, 1], [0, 12])
  const paddingX = useTransform(morph, [0, 1], [24, 16])
  const paddingY = useTransform(morph, [0, 1], [20, 8])
  const radius = useTransform(morph, [0, 1], [0, 20])
  const borderAlpha = useTransform(morph, [0, 1], [0, 0.08])
  const backgroundAlpha = useTransform(morph, [0, 1], [0, 0.04])
  const shadowAlpha = useTransform(morph, [0, 1], [0, 0.3])
  const blur = useTransform(morph, [0, 1], [0, 40])
  const borderColor = useTransform(borderAlpha, (value) => `rgba(255, 255, 255, ${value})`)
  const backgroundColor = useTransform(backgroundAlpha, (value) => `rgba(255, 255, 255, ${value})`)
  const boxShadow = useTransform(shadowAlpha, (value) => `0 2px 24px rgba(0, 0, 0, ${value})`)
  const backdropFilter = useTransform(blur, (value) => `blur(${value}px)`)

  const desktopNavStyle = isDesktop
    ? {
        maxWidth,
        marginTop,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        paddingTop: paddingY,
        paddingBottom: paddingY,
        borderRadius: radius,
        borderColor,
        backgroundColor,
        boxShadow,
        backdropFilter,
      }
    : undefined

  useEffect(() => {
    const onScroll = () => setShaped(window.scrollY > 20)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const onChange = () => setIsDesktop(media.matches)
    onChange()
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        <motion.nav
          style={desktopNavStyle}
          className={cn(
            "relative mx-auto flex max-w-6xl items-center justify-between border border-transparent bg-transparent px-6 py-3 md:py-5",
            mobileOpen &&
              "max-md:bg-[#0a0a0a] max-md:border-b max-md:border-white/[0.06]"
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
                  : "scale-[0.58] md:scale-[0.65] -ml-3 md:ml-0 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
              )}
            />
          </Link>

          {/* Desktop nav links — absolute centered */}
          <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center justify-center gap-7">
            {NAV_LINKS.map((link) => {
              const href =
                link.homeAware && !onMarketingHome
                  ? "/"
                  : link.href.startsWith("/")
                    ? link.href
                    : onMarketingHome
                      ? link.href
                      : `/${link.href}`
              const useLink = href.startsWith("/")
              const className = cn(
                "group inline-flex items-center gap-0.5 text-[13px] text-white/45 transition-colors duration-200 hover:text-white/90",
                link.external && "gap-1",
              )
              const onDocsClick = () => {
                if (link.label === "Docs") {
                  trackMarketingEvent("docs_clicked", { source: "nav_desktop" })
                }
              }
              return useLink ? (
                <Link
                  key={link.label}
                  href={href}
                  onClick={onDocsClick}
                  {...(link.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className={className}
                >
                  {link.label}
                  {link.external ? (
                    <ArrowUpRight
                      size={11}
                      className="opacity-0 transition-opacity duration-200 group-hover:opacity-60"
                    />
                  ) : null}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={href}
                  onClick={onDocsClick}
                  {...(link.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className={className}
                >
                  {link.label}
                  {link.external ? (
                    <ArrowUpRight
                      size={11}
                      className="opacity-0 transition-opacity duration-200 group-hover:opacity-60"
                    />
                  ) : null}
                </a>
              )
            })}
          </div>

          {/* Desktop CTA cluster */}
          <div className="hidden md:flex items-center justify-end gap-2.5">
            <ChromeWebstoreBadge
              source="nav_desktop"
              iconOnly={shaped}
              onClick={() => {
                trackMarketingEvent("add_to_chrome_clicked", { source: "nav_desktop" })
              }}
            />
            <Link
              href={isLoggedIn ? "/dashboard" : "/get-started"}
              onClick={() => {
                trackMarketingEvent("get_started_clicked", { source: "nav_desktop" })
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap shrink-0",
                "bg-white text-[#0a0a0a] shadow-[0_2px_12px_rgba(255,255,255,0.08)]",
                "transition-all duration-300 ease-out hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(255,255,255,0.14)]"
              )}
            >
              {isLoggedIn ? "Dashboard" : "Get started"}
              <ArrowRight
                className={cn(
                  "h-3.5 w-3.5 overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  shaped ? "max-w-0 -ml-1.5 opacity-0" : "max-w-4 opacity-100"
                )}
              />
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-1.5 text-white/70 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </motion.nav>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-[68px] z-40 bg-[#0a0a0a]/98 backdrop-blur-xl border-y border-white/[0.06] shadow-[0_18px_50px_rgba(0,0,0,0.45)] md:hidden"
          >
            <div className="px-5 pt-7 pb-6 flex flex-col gap-6">
              {NAV_LINKS.map((link) => {
                const href =
                  link.homeAware && !onMarketingHome
                    ? "/"
                    : link.href.startsWith("/")
                      ? link.href
                      : onMarketingHome
                        ? link.href
                        : `/${link.href}`
                const useLink = href.startsWith("/")
                const mobileClass =
                  "group inline-flex items-center gap-1 text-base text-white/60 transition-colors hover:text-white py-0.5"
                const onNavClick = () => {
                  if (link.label === "Docs") {
                    trackMarketingEvent("docs_clicked", { source: "nav_mobile" })
                  }
                  setMobileOpen(false)
                }
                return useLink ? (
                  <Link
                    key={link.label}
                    href={href}
                    onClick={onNavClick}
                    {...(link.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className={mobileClass}
                  >
                    {link.label}
                    {link.external ? (
                      <ArrowUpRight
                        size={12}
                        className="opacity-50 transition-opacity group-hover:opacity-80"
                      />
                    ) : null}
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={href}
                    onClick={onNavClick}
                    {...(link.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className={mobileClass}
                  >
                    {link.label}
                    {link.external ? (
                      <ArrowUpRight
                        size={12}
                        className="opacity-50 transition-opacity group-hover:opacity-80"
                      />
                    ) : null}
                  </a>
                )
              })}
              <ChromeWebstoreBadge
                source="nav_mobile"
                onClick={() => {
                  trackMarketingEvent("add_to_chrome_clicked", { source: "nav_mobile" })
                  setMobileOpen(false)
                }}
                className="mt-1 inline-flex justify-center"
              />
              <Link
                href={isLoggedIn ? "/dashboard" : "/get-started"}
                onClick={() => {
                  trackMarketingEvent("get_started_clicked", { source: "nav_mobile" })
                  setMobileOpen(false)
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white text-[#0a0a0a] px-5 py-2.5 text-sm font-medium"
              >
                {isLoggedIn ? "Dashboard" : "Get Started"} →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
