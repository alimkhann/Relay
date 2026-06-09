"use client"

import { useState } from "react"
import { motion, useInView, AnimatePresence } from "motion/react"
import { useRef } from "react"
import { ChevronDown } from "lucide-react"

const ease = [0.25, 0.1, 0.25, 1] as const

const FAQ_ITEMS = [
  {
    question: "What does Relay actually save?",
    answer:
      "Decisions, tasks, and constraints extracted from your chat — not the full transcript. You control which chats are tracked and can delete any project and its data at any time.",
  },
  {
    question: "Which AI tools does Relay work with?",
    answer:
      "Browser: ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek. IDE agents via MCP: Claude Code, Cursor, Codex, Windsurf, and 20+ others.",
  },
  {
    question: "What is MCP and how does Relay use it?",
    answer:
      "MCP (Model Context Protocol) is an open standard for giving AI agents access to structured data. Relay runs an MCP server locally so your IDE agent can read and write your project brief directly.",
  },
  {
    question: "Is my data private?",
    answer:
      "Your brief is stored in your Relay account (cloud, encrypted). You choose which chats are tracked. You can delete any project and its data at any time.",
  },
  {
    question: "Is Relay free?",
    answer:
      "Yes. The Free plan supports up to 2 projects with no card required. Starter is $8/month and Pro is $12/month.",
  },
  {
    question: "Do I need to change how I work?",
    answer:
      "No. Install the extension, associate a chat with a project, and Relay does the rest. MCP setup takes one command.",
  },
]

function BlurRevealText({ text }: { text: string }) {
  const words = text.split(" ")
  return (
    <p className="px-0 pb-1 text-[14px] leading-relaxed text-white/45">
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{
            duration: 0.3,
            delay: i * 0.025,
            ease: [0.04, 0.62, 0.23, 0.98],
          }}
          className="inline-block"
          style={{ marginRight: "0.25em" }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  )
}

export function Faq() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: "-80px" })
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section className="bg-[#0a0a0a] py-24 md:py-32 px-5" ref={sectionRef}>
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="mb-12"
        >
          <p className="text-[10px] tracking-[0.2em] font-medium text-white/45 uppercase mb-4">
            FAQ
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Questions & answers
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, delay: 0.1, ease }}
          className="space-y-2.5"
        >
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.07] bg-[#111] overflow-hidden transition-shadow duration-200 hover:shadow-[0_2px_12px_rgba(255,255,255,0.02)]"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="text-[15px] font-medium leading-snug text-white/80">
                  {item.question}
                </span>
                <ChevronDown
                  className={`h-[18px] w-[18px] shrink-0 text-white/30 transition-transform duration-300 ${
                    open === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      height: {
                        duration: 0.35,
                        ease: [0.04, 0.62, 0.23, 0.98],
                      },
                      opacity: { duration: 0.25 },
                    }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4">
                      <BlurRevealText text={item.answer} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
