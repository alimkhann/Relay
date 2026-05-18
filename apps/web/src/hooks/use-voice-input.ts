"use client"

import { useCallback, useEffect, useRef, useState } from "react"

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

/**
 * Web Speech API wrapper. Isolated behind a hook so the speech backend can be
 * swapped later without touching the chat UI.
 */
export function useVoiceInput(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    if (Ctor) {
      setSupported(true)
      const recognition = new Ctor()
      recognition.lang = "en-US"
      recognition.continuous = false
      recognition.interimResults = false
      recognition.onresult = (event) => {
        const text = Array.from({ length: event.results.length })
          .map((_, i) => event.results[i]?.[0]?.transcript ?? "")
          .join(" ")
          .trim()
        if (text) onFinal(text)
      }
      recognition.onend = () => setListening(false)
      recognition.onerror = () => setListening(false)
      recognitionRef.current = recognition
    }
    return () => {
      recognitionRef.current?.stop()
    }
  }, [onFinal])

  const start = useCallback(() => {
    if (!recognitionRef.current || listening) return
    try {
      recognitionRef.current.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [listening])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  return { supported, listening, start, stop }
}
