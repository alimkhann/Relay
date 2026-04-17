"use client"

import Image from "next/image"

export const CHROME_WEBSTORE_URL =
  "https://chromewebstore.google.com/detail/relay-%E2%80%94-ai-chat-memory-co/ilgnnbhokdndbgchcfffolemkmmkpklf"

interface ChromeWebstoreBadgeProps {
  source: string
  onClick?: () => void
  className?: string
  width?: number
  height?: number
}

export function ChromeWebstoreBadge({
  source,
  onClick,
  className,
  width = 206,
  height = 58,
}: ChromeWebstoreBadgeProps) {
  return (
    <a
      href={CHROME_WEBSTORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      data-source={source}
      aria-label="Available in the Chrome Web Store"
      className={className}
    >
      <Image
        src="/images/chrome-webstore-badge.png"
        alt="Available in the Chrome Web Store"
        width={width}
        height={height}
        priority={false}
        unoptimized
      />
    </a>
  )
}
