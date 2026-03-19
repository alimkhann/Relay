export const LANDING_BACKGROUND_IMAGES = [
  "/images/hero-bg.jpg",
  "/images/hero-bg-gold.jpg",
] as const

export function pickRandomLandingBackground() {
  const index = Math.floor(Math.random() * LANDING_BACKGROUND_IMAGES.length)
  return LANDING_BACKGROUND_IMAGES[index] ?? LANDING_BACKGROUND_IMAGES[0]
}
