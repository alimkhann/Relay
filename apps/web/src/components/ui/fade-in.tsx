"use client";

import { type PropsWithChildren, type CSSProperties } from "react";
import { motion } from "motion/react";

interface FadeInProps extends PropsWithChildren {
  delay?: number;
  duration?: number;
  direction?: "up" | "down" | "none";
  className?: string;
  style?: CSSProperties;
}

export function FadeIn({
  children,
  delay = 0,
  duration = 0.35,
  direction = "up",
  className,
  style,
}: FadeInProps) {
  const y = direction === "up" ? 8 : direction === "down" ? -8 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
