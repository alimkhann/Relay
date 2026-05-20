import { useCallback, useEffect, useRef, useState } from "react"

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult:
    | ((event: {
        resultIndex: number
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
      }) => void)
    | null
  onerror: ((event: { error?: string; message?: string }) => void) | null
  onend: (() => void) | null
}

type VoiceStatus = "idle" | "requesting" | "listening" | "denied" | "error" | "unsupported"
type VoicePermissionState = PermissionState | "unknown"

/**
 * Web Speech API wrapper, copy of the web hook. Kept here rather than imported
 * from the web app so the extension's Plasmo bundler doesn't reach into a
 * Next.js source tree.
 */
export function useVoiceInput(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState<VoiceStatus>("unsupported")
  const [error, setError] = useState<string | null>(null)
  const [permissionState, setPermissionState] = useState<VoicePermissionState>("unknown")
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  const desiredListeningRef = useRef(false)

  useEffect(() => {
    onFinalRef.current = onFinal
  }, [onFinal])

  useEffect(() => {
    if (typeof window === "undefined") return
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition
    if (!Ctor) {
      setStatus("unsupported")
      return
    }

    setSupported(true)
    setStatus("idle")
    const recognition = new Ctor()
    recognition.lang = "en-US"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let finalText = ""
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result?.isFinal) finalText += result[0]?.transcript ?? ""
      }
      finalText = finalText.trim()
      if (finalText) onFinalRef.current(finalText)
    }
    recognition.onend = () => {
      if (desiredListeningRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start()
          setListening(true)
          setStatus("listening")
          return
        } catch {
          /* fall through to stopped state */
        }
      }
      setListening(false)
      setStatus((current) =>
        current === "denied" || current === "error" || current === "unsupported" ? current : "idle"
      )
    }
    recognition.onerror = (event) => {
      setListening(false)
      desiredListeningRef.current = false
      const code = event?.error ?? "unknown"
      if (code === "not-allowed" || code === "service-not-allowed") {
        setPermissionState("denied")
        setStatus("denied")
        setError("Microphone permission is blocked.")
      } else {
        setStatus("error")
        setError(event?.message || "Voice input failed.")
      }
    }
    recognitionRef.current = recognition

    return () => {
      recognition.onresult = null
      recognition.onend = null
      recognition.onerror = null
      try {
        recognition.stop()
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    if (!recognitionRef.current || listening || status === "requesting") return
    desiredListeningRef.current = true
    setError(null)
    setStatus("requesting")
    if (navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({ name: "microphone" as PermissionName })
        setPermissionState(permission.state)
      } catch {
        setPermissionState("unknown")
      }
    }
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        setPermissionState("granted")
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ""
        const denied = name === "NotAllowedError" || name === "SecurityError"
        setPermissionState(denied ? "denied" : "unknown")
        setStatus(denied ? "denied" : "error")
        setError(
          denied
            ? "Microphone permission is blocked."
            : "Couldn't access the microphone."
        )
        return
      }
    }
    try {
      recognitionRef.current.start()
      setListening(true)
      setStatus("listening")
    } catch {
      setListening(false)
      desiredListeningRef.current = false
      setStatus("error")
      setError("Voice input could not start.")
    }
  }, [listening, status])

  const stop = useCallback(() => {
    desiredListeningRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
    setStatus("idle")
  }, [])

  return { supported, listening, status, error, permissionState, start, stop }
}
