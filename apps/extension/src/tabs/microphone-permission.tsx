import { useEffect, useState } from "react"

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

  return (
    <main
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#0b0b0c",
        color: "#f5f5f7",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24
      }}
    >
      <div
        style={{
          maxWidth: 480,
          background: "#16161a",
          border: "1px solid #2a2a30",
          borderRadius: 12,
          padding: 24,
          textAlign: "center"
        }}
      >
        <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Microphone access for Relay</h1>
        <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
          Relay uses your microphone to dictate into the chat. Allow access here once and the side
          panel will work for the rest of the session.
        </p>
        {status === "granted" ? (
          <p style={{ color: "#34d399" }}>Microphone access granted. You can close this tab.</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void request()}
              disabled={status === "requesting"}
              style={{
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                cursor: "pointer",
                fontSize: 14
              }}
            >
              {status === "requesting" ? "Requesting…" : "Allow microphone"}
            </button>
            {error ? (
              <p style={{ color: "#f87171", marginTop: 12, fontSize: 13 }}>{error}</p>
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
