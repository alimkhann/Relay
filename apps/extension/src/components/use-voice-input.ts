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

async function ensureExtensionAudioPermission(): Promise<boolean> {
  const permissions = typeof chrome !== "undefined" ? chrome.permissions : undefined
  if (!permissions?.contains || !permissions.request) return true
  try {
    const request = { permissions: ["audioCapture"] }
    const alreadyGranted = await permissions.contains(request)
    if (alreadyGranted) return true
    return await permissions.request(request)
  } catch {
    return true
  }
}

// Chrome only surfaces the mic permission prompt for getUserMedia inside a
// regular tab — never from the side panel / popup. The denied UI calls this to
// hand control off to a tab page that asks for the permission directly.
export function openMicrophonePermissionTab() {
  try {
    const url = chrome?.runtime?.getURL?.("tabs/microphone-permission.html")
    if (url && chrome?.tabs?.create) {
      void chrome.tabs.create({ url })
      return
    }
  } catch {
    /* fall through to the chrome:// settings link */
  }
  try {
    const id = chrome?.runtime?.id
    if (id && chrome?.tabs?.create) {
      void chrome.tabs.create({
        url: `chrome://settings/content/siteDetails?site=chrome-extension://${id}`
      })
    }
  } catch {
    /* nothing more we can do without user gesture context */
  }
}

/**
 * Web Speech API wrapper, copy of the web hook. Kept here rather than imported
 * from the web app so the extension's Plasmo bundler doesn't reach into a
 * Next.js source tree.
 */
const BAR_COUNT = 9

export function useVoiceInput(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState<VoiceStatus>("unsupported")
  const [error, setError] = useState<string | null>(null)
  const [permissionState, setPermissionState] = useState<VoicePermissionState>("unknown")
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0.18))
  const [volume, setVolume] = useState(0)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  const desiredListeningRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const levelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0.18))
  const volumeRef = useRef(0)

  const stopAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    try {
      analyserRef.current?.disconnect()
    } catch {
      /* already disconnected */
    }
    analyserRef.current = null
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    levelsRef.current = new Array(BAR_COUNT).fill(0.18)
    setLevels(levelsRef.current)
    volumeRef.current = 0
    setVolume(0)
  }, [])

  const startAudioMeter = useCallback(async (stream: MediaStream) => {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    // AudioContext lands suspended after an awaited getUserMedia — see the
    // web hook for the full note. Without resume() RMS reads zero and the
    // waveform freezes at its floor.
    if (ctx.state === "suspended") {
      try {
        await ctx.resume()
      } catch {
        /* keep going; tick will skip frames until state flips to running */
      }
    }
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.6
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
    audioCtxRef.current = ctx
    analyserRef.current = analyser

    const data = new Uint8Array(analyser.fftSize)
    const center = (BAR_COUNT - 1) / 2
    const shape = new Array(BAR_COUNT).fill(0).map((_, i) => {
      const d = Math.abs(i - center) / center
      return 0.45 + 0.55 * (1 - d * d)
    })
    let prevLevel = 0

    const tick = () => {
      if (!analyserRef.current || audioCtxRef.current?.state !== "running") {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      analyserRef.current.getByteTimeDomainData(data)
      let sumSq = 0
      for (let i = 0; i < data.length; i += 1) {
        const v = ((data[i] ?? 128) - 128) / 128
        sumSq += v * v
      }
      const rms = Math.sqrt(sumSq / data.length)
      const normalized = Math.min(1, Math.pow(rms * 4, 0.7))
      const smoothed = prevLevel * 0.6 + normalized * 0.4
      prevLevel = smoothed
      volumeRef.current = smoothed
      setVolume(smoothed)
      const t = performance.now() / 280
      const next = shape.map((s, i) => {
        const wobble = 1 + 0.18 * Math.sin(t + i * 0.7)
        return Math.max(0.16, Math.min(1, 0.16 + smoothed * s * wobble))
      })
      levelsRef.current = next
      setLevels(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

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
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
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
    const extensionAudioGranted = await ensureExtensionAudioPermission()
    if (!extensionAudioGranted) {
      desiredListeningRef.current = false
      setPermissionState("denied")
      setStatus("denied")
      setError("Microphone permission is blocked. Allow microphone access for Relay in Chrome extension settings.")
      return
    }
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
        streamRef.current = stream
        await startAudioMeter(stream)
        setPermissionState("granted")
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ""
        const denied = name === "NotAllowedError" || name === "SecurityError"
        setPermissionState(denied ? "denied" : "unknown")
        setStatus(denied ? "denied" : "error")
        setError(
          denied
            ? "Microphone permission is blocked. Open Chrome extension settings for Relay and allow microphone access."
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
    stopAudio()
    setListening(false)
    setStatus("idle")
  }, [stopAudio])

  useEffect(() => stopAudio, [stopAudio])

  return { supported, listening, status, error, permissionState, levels, volume, start, stop }
}
