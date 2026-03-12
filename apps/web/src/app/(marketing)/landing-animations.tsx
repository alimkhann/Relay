"use client"

import { useEffect, type ReactNode } from "react"
import { animate, inView } from "motion"

export function LandingAnimations({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Nav fade in
    const nav = document.querySelector('[data-animate="nav"]')
    if (nav instanceof HTMLElement) {
      animate(nav, { opacity: [0, 1], y: [-12, 0] }, { duration: 0.5, delay: 0.1 })
    }

    // Hero content — animate each child individually with staggered delay
    const hero = document.querySelector('[data-animate="hero"]')
    if (hero) {
      Array.from(hero.children).forEach((child, i) => {
        if (child instanceof HTMLElement) {
          animate(child, { opacity: [0, 1], y: [24, 0] }, { duration: 0.6, delay: 0.25 + i * 0.12 })
        }
      })
    }

    // Platform bar
    const platforms = document.querySelector('[data-animate="platforms"]')
    if (platforms instanceof HTMLElement) {
      animate(platforms, { opacity: [0, 1] }, { duration: 0.8, delay: 1.0 })
    }

    // Section headings
    document.querySelectorAll('[data-animate="section"]').forEach((el) => {
      if (el instanceof HTMLElement) {
        inView(el, () => {
          animate(el, { opacity: [0, 1], y: [20, 0] }, { duration: 0.5 })
        }, { margin: "-10%" })
      }
    })

    // Steps
    document.querySelectorAll('[data-animate="step"]').forEach((el, i) => {
      if (el instanceof HTMLElement) {
        inView(el, () => {
          animate(el, { opacity: [0, 1], x: [-16, 0] }, { duration: 0.45, delay: i * 0.08 })
        }, { margin: "-5%" })
      }
    })

    // Mockup
    const mockup = document.querySelector('[data-animate="mockup"]')
    if (mockup instanceof HTMLElement) {
      inView(mockup, () => {
        animate(mockup, { opacity: [0, 1], y: [30, 0], scale: [0.97, 1] }, { duration: 0.6 })
      }, { margin: "-10%" })
    }
  }, [])

  return <>{children}</>
}
