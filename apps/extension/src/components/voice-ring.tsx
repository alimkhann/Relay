import React, { useEffect, useRef, type RefObject } from "react"

/**
 * Continuous sine-wave rings encircling the voice composer pill.
 * Mirror of apps/web's VoiceRing; kept in-tree so Plasmo doesn't reach into
 * the Next.js source. Two SVG paths trace the pill perimeter and displace
 * outward by a sine wave whose phase orbits over time. React never
 * re-renders this subtree on volume change — the path `d` is mutated in a
 * single rAF loop reading `volumeRef`.
 */
export function VoiceRing({
  active,
  volumeRef
}: {
  active: boolean
  volumeRef: RefObject<number>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const path1Ref = useRef<SVGPathElement>(null)
  const path2Ref = useRef<SVGPathElement>(null)

  useEffect(() => {
    if (!active) return
    const host = hostRef.current
    if (!host) return

    const SAMPLES = 160
    type Sample = { x: number; y: number; nx: number; ny: number; s: number }
    let cache: { W: number; H: number; pts: Sample[]; total: number } = {
      W: 0,
      H: 0,
      pts: [],
      total: 0
    }

    const resample = (W: number, H: number) => {
      const R = Math.min(W, H) / 2
      const straight = Math.max(0, W - 2 * R)
      const arc = Math.PI * R
      const total = 2 * straight + 2 * arc
      const pts: Sample[] = []
      for (let i = 0; i < SAMPLES; i += 1) {
        const s = (i / SAMPLES) * total
        let rem = s
        let x: number
        let y: number
        let nx: number
        let ny: number
        if (rem < straight) {
          x = R + rem
          y = 0
          nx = 0
          ny = -1
        } else if ((rem -= straight) < arc) {
          const a = -Math.PI / 2 + (rem / arc) * Math.PI
          nx = Math.cos(a)
          ny = Math.sin(a)
          x = W - R + nx * R
          y = H / 2 + ny * R
        } else if ((rem -= arc) < straight) {
          x = W - R - rem
          y = H
          nx = 0
          ny = 1
        } else {
          rem -= straight
          const a = Math.PI / 2 + (rem / arc) * Math.PI
          nx = Math.cos(a)
          ny = Math.sin(a)
          x = R + nx * R
          y = H / 2 + ny * R
        }
        pts.push({ x, y, nx, ny, s })
      }
      cache = { W, H, pts, total }
    }

    let pendingResize = false
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      if (r.width !== cache.W || r.height !== cache.H) {
        cache.W = r.width
        cache.H = r.height
        pendingResize = true
      }
    })
    ro.observe(host)

    const buildPath = (amp: number, freq: number, phase: number, base: number) => {
      const { pts, total } = cache
      if (pts.length === 0) return ""
      let d = ""
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i]
        if (!p) continue
        const env = 0.5 + 0.5 * Math.sin((p.s / total) * Math.PI * 2 * freq + phase)
        const off = base + amp * env
        const px = p.x + p.nx * off
        const py = p.y + p.ny * off
        d += (i === 0 ? "M" : "L") + px.toFixed(2) + "," + py.toFixed(2)
      }
      d += "Z"
      return d
    }

    let raf = 0
    const tick = () => {
      if (pendingResize || cache.pts.length === 0) {
        if (cache.W > 0 && cache.H > 0) resample(cache.W, cache.H)
        pendingResize = false
      }
      const now = performance.now() / 1000
      const vol = volumeRef.current ?? 0
      const phase1 = now * 0.5
      const phase2 = -now * 0.72
      const amp1 = 1.5 + vol * 6
      const amp2 = 1.0 + vol * 4.5
      if (path1Ref.current) {
        path1Ref.current.setAttribute("d", buildPath(amp1, 5, phase1, 3))
      }
      if (path2Ref.current) {
        path2Ref.current.setAttribute("d", buildPath(amp2, 7, phase2, 6))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [active, volumeRef])

  if (!active) return null

  return (
    <div
      ref={hostRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none"
      }}
    >
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible"
        }}
        preserveAspectRatio="none"
      >
        <path
          ref={path1Ref}
          fill="none"
          stroke="var(--ec-accent, currentColor)"
          strokeWidth="1.1"
          strokeOpacity="0.55"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          ref={path2Ref}
          fill="none"
          stroke="var(--ec-accent, currentColor)"
          strokeWidth="0.9"
          strokeOpacity="0.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
