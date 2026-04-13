"use client"

import { useCallback, useEffect, useRef } from "react"

const FEATUREBASE_ORG = process.env["NEXT_PUBLIC_FEATUREBASE_ORG"] ?? ""

declare global {
  interface Window {
    Featurebase?: (action: string, options?: Record<string, unknown>) => void
  }
}

function useFeaturebaseScript() {
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current || !FEATUREBASE_ORG) return
    loaded.current = true

    const script = document.createElement("script")
    script.src = "https://do.featurebase.app/js/sdk.js"
    script.id = "featurebase-sdk"
    script.async = true
    document.head.appendChild(script)

    script.onload = () => {
      window.Featurebase?.("initialize_feedback_widget", {
        organization: FEATUREBASE_ORG,
        placement: "right",
        theme: "light",
      })
    }
  }, [])
}

export function FeaturebaseTrigger({
  kind = "feedback",
  children,
  className,
}: {
  kind?: "feedback" | "feature" | "bug"
  children: React.ReactNode
  className?: string
}) {
  useFeaturebaseScript()

  const handleClick = useCallback(() => {
    if (!window.Featurebase) return
    const boardMap: Record<string, string> = {
      feedback: "feedback",
      feature: "feature-requests",
      bug: "bugs",
    }
    window.Featurebase("manually_open_feedback_widget", {
      board: boardMap[kind],
    })
  }, [kind])

  if (!FEATUREBASE_ORG) return null

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  )
}
