"use client"

import { useEffect, useState } from "react"

const PRELOADER_DONE_EVENT = "relay:preloader-done"

export function usePreloaderReady() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    if (!document.getElementById("relay-preloader")) {
      setReady(true)
      return
    }

    const onDone = () => setReady(true)
    window.addEventListener(PRELOADER_DONE_EVENT, onDone, { once: true })

    return () => {
      window.removeEventListener(PRELOADER_DONE_EVENT, onDone)
    }
  }, [])

  return ready
}
