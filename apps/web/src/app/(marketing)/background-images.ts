export const LANDING_BACKGROUND_IMAGES = [
  "/images/hero-bg.webp",
  "/images/hero-bg-gold.webp",
] as const

export type LandingBackgroundImage = (typeof LANDING_BACKGROUND_IMAGES)[number]

export function pickRandomLandingBackground() {
  const index = Math.floor(Math.random() * LANDING_BACKGROUND_IMAGES.length)
  return LANDING_BACKGROUND_IMAGES[index] ?? LANDING_BACKGROUND_IMAGES[0]
}

export function pickOppositeLandingBackground(
  current: LandingBackgroundImage,
) {
  return current === "/images/hero-bg-gold.webp"
    ? "/images/hero-bg.webp"
    : "/images/hero-bg-gold.webp"
}
