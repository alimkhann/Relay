"use client"

import { useEffect, useState } from "react"

import {
  LANDING_COPY_FLAG,
  type LandingCopyVariant,
} from "@/app/(marketing)/landing-copy"
import { logClientEvent } from "@/lib/telemetry/client"
import { ensurePosthog, posthog } from "@/lib/telemetry/posthog"

export function useLandingCopyExperiment(): LandingCopyVariant {
  const [variant, setVariant] = useState<LandingCopyVariant>("variant")

  useEffect(() => {
    // Init must happen before onFeatureFlags or the subscription is dropped
    // (this hook can mount before PostHogIdentity's effect runs).
    if (!ensurePosthog()) return

    // Record the exposure only once flags have actually loaded — an immediate
    // resolve would log the default variant for every visitor.
    let exposed = false
    posthog.onFeatureFlags(() => {
      const flag = posthog.getFeatureFlag(LANDING_COPY_FLAG)
      const next: LandingCopyVariant = flag === "control" ? "control" : "variant"
      setVariant(next)
      if (!exposed) {
        exposed = true
        logClientEvent({
          level: "info",
          surface: "web-landing",
          area: "marketing",
          event: "experiment_exposure",
          message: "Landing copy experiment exposure.",
          context: { flag: LANDING_COPY_FLAG, variant: next },
        })
      }
    })
  }, [])

  return variant
}