import { useEffect, useState } from "react"
import { Check, Mic, MicOff } from "lucide-react"

import styles from "./microphone-permission.module.css"

type Status = "idle" | "requesting" | "granted" | "denied" | "error"

// Standalone tab page that explicitly requests microphone access. Chrome only
// surfaces the mic permission prompt for `getUserMedia` from a regular tab, not
// from the side panel / popup — so the side-panel UI deep-links here when the
// user taps the mic button and access has not yet been granted to the
// extension origin.
export default function MicrophonePermissionPage() {
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)

  const request = async () => {
    setStatus("requesting")
    setError(null)
    try {
      const permissions = chrome?.permissions
      if (permissions?.request) {
        try {
          await permissions.request({ permissions: ["audioCapture"] })
        } catch {
          /* optional permission; ignore failures */
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setStatus("granted")
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ""
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied")
        setError(
          "Microphone access was blocked. Open chrome://settings/content/microphone, find the Relay extension, and set it to Allow."
        )
      } else {
        setStatus("error")
        setError(err instanceof Error ? err.message : "Couldn't access the microphone.")
      }
    }
  }

  useEffect(() => {
    // Auto-prompt on first paint so the user only has to tap the chrome dialog.
    void request()
  }, [])

  const ringClass =
    status === "granted"
      ? `${styles.iconRing} ${styles.iconRingGranted}`
      : status === "denied" || status === "error"
        ? `${styles.iconRing} ${styles.iconRingDenied}`
        : styles.iconRing

  return (
    <main className={styles.root}>
      <div className={styles.card}>
        <div className={ringClass}>
          {status === "granted" ? (
            <Check size={22} />
          ) : status === "denied" || status === "error" ? (
            <MicOff size={22} />
          ) : (
            <Mic size={22} />
          )}
        </div>
        <h1 className={styles.title}>
          {status === "granted" ? "Microphone ready" : "Microphone access for Relay"}
        </h1>
        <p className={styles.subtitle}>
          {status === "granted"
            ? "You're all set. Close this tab and tap the mic in the Relay side panel."
            : "Relay uses your microphone to dictate into the chat. Allow access once and the side panel will keep working."}
        </p>
        {status === "granted" ? (
          <p className={styles.success}>
            <span className={styles.successAccent}>All set.</span> You can close this tab.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void request()}
              disabled={status === "requesting"}
              className={styles.button}
            >
              {status === "requesting" ? "Requesting…" : "Allow microphone"}
            </button>
            {error ? <p className={styles.error}>{error}</p> : null}
          </>
        )}
      </div>
    </main>
  )
}
