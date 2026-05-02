"use client"

import type { PropsWithChildren } from "react"
import { AnimatePresence, motion } from "motion/react"

interface SettingsContentProps extends PropsWithChildren {
  section: string
}

export function SettingsContent({ section, children }: SettingsContentProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={section}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
