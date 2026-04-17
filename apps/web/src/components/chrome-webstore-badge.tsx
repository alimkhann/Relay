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
        "group inline-flex items-center rounded-full bg-white text-[#0a0a0a] font-semibold whitespace-nowrap",
        "shadow-[0_2px_12px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_20px_rgba(255,255,255,0.14)] hover:-translate-y-px",
        MORPH,
        iconOnly ? "gap-0 px-2 py-2" : "gap-2 pl-3 pr-5 py-2 text-sm",
        className
      )}
    >
      <Image
        src="/images/192px.svg"
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 shrink-0"
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
        {label}
      </span>
    </a>
  )
}
