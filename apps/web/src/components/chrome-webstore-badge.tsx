"use client"

import Image from "next/image"
import { cn } from "@/lib/cn"

export const CHROME_WEBSTORE_URL =
  "https://chromewebstore.google.com/detail/relay-%E2%80%94-ai-chat-memory-co/ilgnnbhokdndbgchcfffolemkmmkpklf"

interface ChromeWebstoreBadgeProps {
  source: string
  onClick?: () => void
  className?: string
  iconOnly?: boolean
  label?: string
}

export function ChromeWebstoreBadge({
  source,
  onClick,
  className,
  iconOnly = false,
  label = "Get extension",
}: ChromeWebstoreBadgeProps) {
  return (
    <a
      href={CHROME_WEBSTORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      data-source={source}
      aria-label="Add Relay to Chrome — Chrome Web Store"
      className={cn(
        "group inline-flex items-center gap-2 rounded-full font-semibold whitespace-nowrap",
        "bg-white text-[#0a0a0a] shadow-[0_2px_12px_rgba(255,255,255,0.08)]",
        "transition-all duration-300 ease-out hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(255,255,255,0.14)]",
        iconOnly ? "p-1.5" : "pl-2 pr-5 py-1.5 text-sm",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full overflow-hidden bg-white",
          iconOnly ? "h-7 w-7" : "h-8 w-8"
        )}
      >
        <Image
          src="/images/192px.svg"
          alt=""
          width={32}
          height={32}
          className="h-full w-full object-cover"
          priority={false}
          unoptimized
        />
      </span>
      {!iconOnly ? <span>{label}</span> : null}
    </a>
  )
}
