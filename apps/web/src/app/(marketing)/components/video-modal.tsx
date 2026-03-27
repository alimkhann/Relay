"use client"

import { useEffect, useRef } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { motion, AnimatePresence } from "motion/react"
import { X } from "lucide-react"

const ease = [0.25, 0.1, 0.25, 1] as const

interface VideoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoSrc: string
}

export function VideoModal({ open, onOpenChange, videoSrc }: VideoModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (open && videoRef.current) {
      void videoRef.current.play()
    }
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center p-6 md:p-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) onOpenChange(false)
                }}
              >
                <Dialog.Title className="sr-only">
                  Feature video preview
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  Expanded video preview of a Relay feature
                </Dialog.Description>
                <motion.div
                  className="relative w-full max-w-4xl aspect-video rounded-2xl overflow-hidden border border-white/[0.08] bg-black"
                  initial={{ scale: 0.96 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.96 }}
                  transition={{ duration: 0.2, ease }}
                >
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    controls
                  />
                  <Dialog.Close asChild>
                    <button
                      className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 border border-white/[0.12] backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors duration-150"
                      aria-label="Close video"
                    >
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </motion.div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
