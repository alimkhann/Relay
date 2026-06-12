import Image from "next/image"

const BLOG_HERO_IMAGES: Record<string, string> = {
  "why-your-ai-tools-forget-everything": "/images/blog/blog1.webp",
  "how-i-use-relay-with-claude-code": "/images/blog/blog2.webp",
  "7-relay-features-you-probably-missed": "/images/blog/blog3.webp",
  "project-memory-vs-personal-memory": "/images/blog/blog4.webp",
  "relay-beyond-ai-chats": "/images/blog/blog5.webp",
}

export function BlogHeroArt({
  slug,
  className = "",
}: {
  slug: string
  className?: string
}) {
  const src = BLOG_HERO_IMAGES[slug]
  if (!src) return null

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/[0.07] ${className}`}
      style={{ aspectRatio: "16 / 9" }}
    >
      <Image
        src={src}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 672px"
        priority={false}
      />
    </div>
  )
}