"use client"

import { useEffect, useState } from "react"
import { SpeedInsights } from "@vercel/speed-insights/next"

function resolveSampleRate() {
  const configured = Number(process.env.NEXT_PUBLIC_SPEED_INSIGHTS_SAMPLE_RATE)
  if (Number.isFinite(configured)) {
    return Math.min(1, Math.max(0, configured))
  }

  return process.env.NODE_ENV === "production" ? 0.25 : 0
}

export function SampledSpeedInsights() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(Math.random() < resolveSampleRate())
  }, [])

  return enabled ? <SpeedInsights /> : null
}
