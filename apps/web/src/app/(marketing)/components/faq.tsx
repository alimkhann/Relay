"use client"

import { motion, useInView } from "motion/react"
import { useRef } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

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
      "Yes. The Free plan supports up to 2 projects with no card required. Pro is $9/month for unlimited everything.",
  },
  {
    question: "Do I need to change how I work?",
    answer:
      "No. Install the extension, associate a chat with a project, and Relay does the rest. MCP setup takes one command.",
  },
]

export function Faq() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <section className="bg-[#0a0a0a] py-24 md:py-32 px-5" ref={ref}>
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.5, ease }}
          className="mb-12"
        >
          <p className="text-[10px] tracking-[0.2em] font-medium text-white/25 uppercase mb-4">
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
        >
          <Accordion type="single" collapsible className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="rounded-xl border border-white/[0.06] bg-[#111] px-5 overflow-hidden"
              >
                <AccordionTrigger className="text-left text-sm font-medium text-white/80 hover:text-white py-4 [&[data-state=open]>svg]:rotate-180">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-white/40 leading-relaxed pb-4">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  )
}
