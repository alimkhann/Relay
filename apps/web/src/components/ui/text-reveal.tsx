"use client";

import { motion } from "motion/react";

interface TextRevealProps {
  text: string;
  stagger?: number;
  duration?: number;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
}

export function TextReveal({
  text,
  stagger = 0.03,
  duration = 0.4,
  className,
  as: Tag = "span",
}: TextRevealProps) {
  const words = text.split(" ");

  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration,
            delay: i * stagger,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          style={{ display: "inline-block", marginRight: "0.25em" }}
        >
          {word}
        </motion.span>
      ))}
    </Tag>
  );
}
