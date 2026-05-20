"use client"

import { Globe } from "@/components/ui/globe"

export function NotFoundGlobe() {
  return (
    <Globe
      className="!absolute !inset-[-12px] !max-w-none opacity-90"
      config={{
        width: 700,
        height: 700,
        onRender: () => {},
        devicePixelRatio: 2,
        phi: 0,
        theta: 0.22,
        dark: 1,
        diffuse: 1.1,
        mapSamples: 16000,
        mapBrightness: 5.5,
        baseColor: [0.09, 0.09, 0.1],
        markerColor: [0.9, 0.9, 0.9],
        glowColor: [0.18, 0.18, 0.2],
        markers: []
      }}
    />
  )
}
