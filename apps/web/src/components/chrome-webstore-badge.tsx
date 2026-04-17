"use client"

import { cn } from "@/lib/cn"

export const CHROME_WEBSTORE_URL =
  "https://chromewebstore.google.com/detail/relay-%E2%80%94-ai-chat-memory-co/ilgnnbhokdndbgchcfffolemkmmkpklf"

interface ChromeWebstoreBadgeProps {
  source: string
  onClick?: () => void
  className?: string
  variant?: "primary" | "compact"
  label?: string
}

function ChromeLogo({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="9.5" fill="#fff" />
      <path
        d="M24 14.5h18.78A23.98 23.98 0 0 0 3.9 12.3l9.4 16.28A11 11 0 0 1 24 14.5z"
        fill="#ea4335"
      />
      <path
        d="M14.6 24a9.4 9.4 0 0 1 .74-3.65L5.93 4.02A23.9 23.9 0 0 0 0 24c0 13.26 10.74 24 24 24l9.42-16.3A11 11 0 0 1 14.6 24z"
        fill="#fbbc04"
      />
      <path
        d="M24 33.4a9.4 9.4 0 0 1-8.14-4.74L6.45 44.94A23.98 23.98 0 0 0 24 48l9.42-16.32A11 11 0 0 1 24 33.4z"
        fill="#34a853"
      />
      <path
        d="M33.4 24c0 3.35-1.73 6.3-4.36 8.02L19.62 48A24 24 0 0 0 42.78 14.5H24A9.4 9.4 0 0 1 33.4 24z"
        fill="#4285f4"
      />
    </svg>
  )
}

export function ChromeWebstoreBadge({
  source,
  onClick,
  className,
  variant = "primary",
  label = "Get extension",
}: ChromeWebstoreBadgeProps) {
  const base =
    "group inline-flex items-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-300"
  const variants = {
    primary:
      "px-5 py-2.5 text-sm bg-white text-[#0a0a0a] shadow-[0_2px_12px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.14)] hover:-translate-y-px",
    compact:
      "px-4 py-2 text-[13px] bg-white text-[#0a0a0a] shadow-[0_2px_10px_rgba(255,255,255,0.06)] hover:shadow-[0_3px_16px_rgba(255,255,255,0.12)]",
  }

  return (
    <a
      href={CHROME_WEBSTORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      data-source={source}
      aria-label="Add Relay to Chrome — Chrome Web Store"
      className={cn(base, variants[variant], className)}
    >
      <ChromeLogo size={variant === "compact" ? 15 : 17} />
      <span>{label}</span>
    </a>
  )
}
