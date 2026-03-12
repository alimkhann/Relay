"use client"

import { useEffect, type ReactNode } from "react"
import { animate, inView } from "motion"

export function LandingAnimations({ children }: { children: ReactNode }) {
  useEffect(() => {
    /* Track elements that have already been animated to prevent flicker on re-trigger */
    const done = new WeakSet<Element>()

    function once(el: HTMLElement, keyframes: Record<string, unknown>, options: Record<string, unknown>) {
      if (done.has(el)) return
      done.add(el)
      animate(el, keyframes, options)
    }

    // ── Instant entrance: nav ──
    const nav = document.querySelector('[data-animate="nav"]')
    if (nav instanceof HTMLElement) {
      animate(nav, { opacity: [0, 1], y: [-12, 0] }, { duration: 0.5, delay: 0.1 })
    }

    // ── Instant entrance: hero children (staggered) ──
    const hero = document.querySelector('[data-animate="hero"]')
    if (hero) {
      Array.from(hero.children).forEach((child, i) => {
        if (child instanceof HTMLElement) {
          animate(child, { opacity: [0, 1], y: [24, 0] }, { duration: 0.6, delay: 0.25 + i * 0.12 })
        }
      })
    }

    // ── Instant entrance: platform bar ──
    const platforms = document.querySelector('[data-animate="platforms"]')
    if (platforms instanceof HTMLElement) {
      animate(platforms, { opacity: [0, 1] }, { duration: 0.8, delay: 1.0 })
    }

    // ── Scroll-triggered (fire once): section headings ──
    document.querySelectorAll('[data-animate="section"]').forEach((el) => {
      if (el instanceof HTMLElement) {
        el.style.opacity = "0"
        inView(el, () => {
          once(el, { opacity: [0, 1], y: [20, 0] }, { duration: 0.5 })
        }, { margin: "-10%" })
      }
    })

    // ── Scroll-triggered (fire once): steps ──
    document.querySelectorAll('[data-animate="step"]').forEach((el, i) => {
      if (el instanceof HTMLElement) {
        el.style.opacity = "0"
        inView(el, () => {
          once(el, { opacity: [0, 1], x: [-16, 0] }, { duration: 0.45, delay: i * 0.08 })
        }, { margin: "-5%" })
      }
    })

    // ── Scroll-triggered (fire once): FAQ items ──
    document.querySelectorAll('[data-animate="faq-item"]').forEach((el, i) => {
      if (el instanceof HTMLElement) {
        el.style.opacity = "0"
        inView(el, () => {
          once(el, { opacity: [0, 1], y: [12, 0] }, { duration: 0.4, delay: i * 0.06 })
        }, { margin: "-5%" })
      }
    })
  }, [])

  return <>{children}</>
}
