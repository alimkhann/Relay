export const LANDING_BACKGROUND_IMAGES = [
  "/images/hero-bg.webp",
  "/images/hero-bg-gold.webp",
] as const

export type LandingBackgroundImage = (typeof LANDING_BACKGROUND_IMAGES)[number]

export function pickRandomLandingBackground(): LandingBackgroundImage {
  const day = new Date().toISOString().slice(0, 10)
  let hash = 0
  for (const ch of day) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const index = Math.abs(hash) % LANDING_BACKGROUND_IMAGES.length
  return LANDING_BACKGROUND_IMAGES[index] ?? LANDING_BACKGROUND_IMAGES[0]
}

export function pickOppositeLandingBackground(
  current: LandingBackgroundImage,
): LandingBackgroundImage {
  return current === "/images/hero-bg-gold.webp"
    ? "/images/hero-bg.webp"
    : "/images/hero-bg-gold.webp"
}
