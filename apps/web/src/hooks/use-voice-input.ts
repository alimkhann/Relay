"use client"

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
 * Web Speech API wrapper. Isolated behind a hook so the speech backend can be
 * swapped later without touching the chat UI.
 *
 * The recognition instance is created exactly once. `onFinal` is read through a
 * ref so a fresh callback closure on every parent render does not tear down and
 * recreate the recognizer mid-utterance (the original bug: an unstable
 * `onFinal` made the init effect re-run every render, and its cleanup `.stop()`
 * killed any in-flight session before it could emit a result).
 */
const BAR_COUNT = 9

export function useVoiceInput(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState<VoiceStatus>("unsupported")
  const [error, setError] = useState<string | null>(null)
  const [permissionState, setPermissionState] = useState<VoicePermissionState>("unknown")
  const [levels, setLevels] = useState<number[]>(() => new Array(BAR_COUNT).fill(0.18))
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  const desiredListeningRef = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const levelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0.18))

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
  }, [])

  const startAudioMeter = useCallback((stream: MediaStream) => {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 64
    analyser.smoothingTimeConstant = 0.55
    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)
    audioCtxRef.current = ctx
    analyserRef.current = analyser

    const bins = analyser.frequencyBinCount
    const data = new Uint8Array(bins)
    // Map BAR_COUNT bars across the lowest ~70% of bins (voice sits there) and
    // log-scale so the small high-frequency tail doesn't always look dead.
    const range = Math.max(1, Math.floor(bins * 0.7))
    const slot = Math.max(1, Math.floor(range / BAR_COUNT))

    const tick = () => {
      if (!analyserRef.current) return
      analyserRef.current.getByteFrequencyData(data)
      const next = new Array(BAR_COUNT).fill(0)
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const start = i * slot
        const end = Math.min(range, start + slot)
        let sum = 0
        for (let j = start; j < end; j += 1) sum += data[j] ?? 0
        const avg = sum / Math.max(1, end - start) / 255
        // Lift the floor so idle still shows a small wave, ceiling stays at 1.
        next[i] = Math.max(0.18, Math.min(1, avg * 1.6))
      }
      // Light low-pass smoothing toward previous to avoid jitter.
      const prev = levelsRef.current
      const smoothed = next.map((v, i) => prev[i]! * 0.55 + v * 0.45)
      levelsRef.current = smoothed
      setLevels(smoothed)
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
      // Release mic + analyser when recognition bails out so the recording
      // indicator in the browser tab disappears.
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
        startAudioMeter(stream)
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
    stopAudio()
    setListening(false)
    setStatus("idle")
  }, [stopAudio])

  useEffect(() => stopAudio, [stopAudio])

  return { supported, listening, status, error, permissionState, levels, start, stop }
}
