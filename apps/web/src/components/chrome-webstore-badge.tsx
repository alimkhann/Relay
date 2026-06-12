"use client"

import Image from "next/image"
import { cn } from "@/lib/cn"

export const CHROME_WEBSTORE_URL =
  "https://chromewebstore.google.com/detail/relay-%E2%80%94-ai-chat-memory-co/ilgnnbhokdndbgchcfffolemkmmkpklf"

const MORPH = "transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"

interface ChromeWebstoreBadgeProps {
  source: string
  onClick?: () => void
  className?: string
  iconOnly?: boolean
  compact?: boolean
  label?: string
}

export function ChromeWebstoreBadge({
  source,
  onClick,
  className,
  iconOnly = false,
  compact = false,
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
        "group inline-flex items-center font-semibold whitespace-nowrap shrink-0",
        MORPH,
        "hover:-translate-y-px",
        iconOnly
          ? "gap-0 p-0 bg-transparent shadow-none rounded-none"
          : compact
            ? "gap-1.5 pl-2.5 pr-4 py-2 text-xs rounded-full bg-white text-[#0a0a0a] shadow-[0_2px_12px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.14)] md:gap-2 md:pl-3 md:pr-5 md:py-2.5 md:text-sm"
            : "gap-2 pl-3 pr-5 py-2.5 text-sm rounded-full bg-white text-[#0a0a0a] shadow-[0_2px_12px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.14)]",
        className
      )}
    >
      <Image
        src="/images/192px.svg"
        alt={iconOnly ? "Get Relay extension" : ""}
        width={40}
        height={40}
        className={cn(
          "shrink-0",
          MORPH,
          iconOnly ? "h-9 w-9" : compact ? "h-4 w-4 md:h-5 md:w-5" : "h-5 w-5",
        )}
        priority={false}
        unoptimized
      />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap",
          MORPH,
          iconOnly ? "max-w-0 opacity-0" : "max-w-[200px] opacity-100"
        )}
      >
        {compact ? (
          <>
            <span className="md:hidden">Extension</span>
            <span className="hidden md:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </span>
    </a>
  )
}
