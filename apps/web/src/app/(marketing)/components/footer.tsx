import Image from "next/image"
import Link from "next/link"

const SOCIALS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/alimkhan_yv/",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: "Threads",
    href: "https://www.threads.com/@alimkhan_yv?hl=en",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.182.408-2.256 1.33-3.022.88-.732 2.063-1.139 3.327-1.145.93-.005 1.791.146 2.56.45.021-.652-.003-1.3-.071-1.94l2.035-.266c.089.774.13 1.566.12 2.358.892.45 1.636 1.058 2.192 1.86.745 1.074 1.135 2.427 1.057 3.878H22c.094-1.8-.36-3.484-1.263-4.86 1.969-.266 3.236-2.312 2.772-4.584l-.006-.028-.207-.93-2.02.45.208.93c.232 1.14-.399 2.16-1.478 2.392a4.18 4.18 0 0 0-.623-1.193c-.747-1.015-1.88-1.58-3.278-1.637l-.025-.001c-1.476-.044-2.834.47-3.723 1.41-.844.893-1.272 2.085-1.205 3.356.068 1.3.62 2.398 1.554 3.087.871.64 2.005.97 3.196.93 1.063-.058 1.9-.454 2.49-1.18.39-.481.674-1.096.855-1.823.537.268.98.624 1.313 1.064.587.773.827 1.792.69 2.874-.172 1.349-.857 2.56-1.928 3.41-1.18.939-2.794 1.44-4.795 1.486l-.038.001c-2.26-.03-4.032-.65-5.27-1.84-1.263-1.213-1.906-3.01-1.906-5.34v-.36h16.87l.03-.188c.188-1.194.149-2.223-.116-3.128a6.473 6.473 0 0 0-.54-1.326Z" />
      </svg>
    ),
  },
  {
    label: "X",
    href: "https://x.com/alimmka_",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/alimkhan-yergebayev/",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
]

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
        <div className="mt-8 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/15">
            © 2026 Relay. All rights reserved.
          </p>

          {/* Socials */}
          <div className="flex items-center gap-3">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/20 hover:text-white/50 transition-colors"
                aria-label={social.label}
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
