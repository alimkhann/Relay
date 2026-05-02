"use client"

import { useEffect, useRef } from "react"

const HEARTBEAT_INTERVAL_MS = 45 * 60 * 1000 // 45 minutes
const FOCUS_STALE_MS = 5 * 60 * 1000 // 5 minutes

function pingSession() {
  void fetch("/api/auth/get-session", { credentials: "include" }).catch(() => {})
}

export function SessionKeepalive() {
  const lastPingRef = useRef(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      pingSession()
      lastPingRef.current = Date.now()
    }, HEARTBEAT_INTERVAL_MS)

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && Date.now() - lastPingRef.current > FOCUS_STALE_MS) {
        pingSession()
        lastPingRef.current = Date.now()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  return null
}
