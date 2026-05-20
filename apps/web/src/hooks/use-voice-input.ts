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
  onerror: (() => void) | null
  onend: (() => void) | null
}

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
export function useVoiceInput(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)

  useEffect(() => {
    onFinalRef.current = onFinal
  }, [onFinal])

  useEffect(() => {
    if (typeof window === "undefined") return
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition
    if (!Ctor) return

    setSupported(true)
    const recognition = new Ctor()
    recognition.lang = "en-US"
    recognition.continuous = false
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
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
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
