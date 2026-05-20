import { useEffect, useState } from "react"

import type { RelayResolvedTheme } from "../storage/theme"

/**
 * Read the live resolved theme that ControlPanel writes to
 * `document.documentElement.dataset.relayTheme`. Updates when the user changes
 * the theme in settings (ControlPanel sets the attribute) and when the OS
 * theme flips while the user is on "system".
 */
export function useResolvedTheme(): RelayResolvedTheme {
  const [theme, setTheme] = useState<RelayResolvedTheme>(() => {
    if (typeof document === "undefined") return "dark"
    const current = document.documentElement.dataset.relayTheme
    return current === "light" ? "light" : "dark"
  })

  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    const read = () => {
      const current = root.dataset.relayTheme
      setTheme(current === "light" ? "light" : "dark")
    }
    read()
    const obs = new MutationObserver(read)
    obs.observe(root, { attributes: true, attributeFilter: ["data-relay-theme"] })
    return () => obs.disconnect()
  }, [])

  return theme
}
