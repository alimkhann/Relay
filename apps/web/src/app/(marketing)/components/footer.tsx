import Image from "next/image"
import Link from "next/link"

export function Footer() {
  return (
    <footer className="bg-[#0a0a0a] px-5 pb-8 pt-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Left */}
          <div className="flex items-center gap-3">
            <Image
              src="/images/relay_logo_white.png"
              alt="Relay"
              width={22}
              height={22}
              className="opacity-40"
            />
            <p className="text-sm text-white/25">
              Keep your project brief ready for every fresh AI chat.
            </p>
          </div>

          {/* Right — links */}
          <div className="flex items-center gap-6">
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/25 hover:text-white/50 transition-colors"
            >
              Docs
            </a>
            <Link
              href="/terms"
              className="text-sm text-white/25 hover:text-white/50 transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-sm text-white/25 hover:text-white/50 transition-colors"
            >
              Privacy
            </Link>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-6 border-t border-white/[0.04]">
          <p className="text-xs text-white/15">
            © 2026 Relay. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
