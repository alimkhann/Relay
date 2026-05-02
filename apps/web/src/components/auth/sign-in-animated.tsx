"use client"

import { motion } from "motion/react"

const ease = [0.25, 0.1, 0.25, 1] as const

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay, ease },
  }),
}

export function SignInAnimated({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      custom={0}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  )
}

export function SignInAnimatedItem({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      custom={delay}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  )
}
