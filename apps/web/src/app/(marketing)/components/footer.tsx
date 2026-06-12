import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { docsHref } from "@/components/docs/docs-back-link"

type SocialLink =
  | { label: string; href: string; icon: ReactNode }
  | { label: string; href: string; imageSrc: string }

const SOCIALS: SocialLink[] = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/alimkhan_yv/",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: "Threads",
    href: "https://www.threads.com/@alimkhan_yv?hl=en",
    imageSrc: "/images/threads.png",
  },
  {
    label: "X",
    href: "https://x.com/alimmka_",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/alimkhan-yergebayev/",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
]

const FOOTER_LINKS = [
  { label: "Docs", href: docsHref("landing"), external: true },
  { label: "Blog", href: "/blog", external: false },
  { label: "Terms", href: "/terms", external: false },
  { label: "Privacy", href: "/privacy", external: false },
  { label: "Refund", href: "/refund", external: false },
] as const

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#0a0a0a]">
      <div className="relative z-10 mx-auto max-w-5xl px-5 pb-6 pt-14 md:pt-16">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/images/relay_logo_white.png"
              alt="Relay"
              width={22}
              height={22}
              className="opacity-50"
            />
            <p className="max-w-sm text-sm leading-relaxed text-white/45">
              Keep your project brief ready for every fresh AI chat.
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-1 text-sm text-white/40 transition-colors hover:text-white/70"
                >
                  {link.label}
                  <ArrowUpRight
                    size={12}
                    className="opacity-0 transition-opacity group-hover:opacity-60"
                  />
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-white/40 transition-colors hover:text-white/70"
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xs text-white/25">© 2026 Relay. All rights reserved.</p>

          <div className="flex items-center gap-3">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/30 transition-colors hover:text-white/60"
                aria-label={social.label}
              >
                {"imageSrc" in social ? (
                  <Image
                    src={social.imageSrc}
                    alt=""
                    width={16}
                    height={16}
                    className="h-4 w-4 brightness-0 invert opacity-100"
                  />
                ) : (
                  social.icon
                )}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Giant wordmark — ~65% visible, bottom tail clipped at page edge */}
      <div
        className="relative w-full overflow-hidden"
        style={{ height: "clamp(92px, 17vw, 176px)" }}
        aria-hidden
      >
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 w-full max-w-[min(100%,1100px)] opacity-[0.42]"
          style={{ transform: "translateX(-50%) translateY(44%)" }}
        >
          <Image
            src="/images/footer.png"
            alt=""
            width={1672}
            height={941}
            sizes="100vw"
            className="h-auto w-full select-none"
          />
        </div>
      </div>
    </footer>
  )
}