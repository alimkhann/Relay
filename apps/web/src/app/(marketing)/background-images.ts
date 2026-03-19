export const LANDING_BACKGROUND_IMAGES = [
  "/images/hero-bg.jpg",
  "/images/hero-bg-gold.jpg",
] as const

export type LandingBackgroundImage = (typeof LANDING_BACKGROUND_IMAGES)[number]

export function pickRandomLandingBackground() {
  const index = Math.floor(Math.random() * LANDING_BACKGROUND_IMAGES.length)
  return LANDING_BACKGROUND_IMAGES[index] ?? LANDING_BACKGROUND_IMAGES[0]
}

export function pickOppositeLandingBackground(
  current: LandingBackgroundImage,
) {
  return current === "/images/hero-bg-gold.jpg"
    ? "/images/hero-bg.jpg"
    : "/images/hero-bg-gold.jpg"
}
