"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const faqs = [
  {
    q: "What does Relay actually save?",
    a: "Relay captures the full text of your AI chats — messages from both you and the AI. It then generates a concise project brief summarizing key decisions, open tasks, and constraints, so your next chat starts with full context.",
  },
  {
    q: "Which AI tools does Relay work with?",
    a: "Relay currently works with ChatGPT, Claude, Codex, and Perplexity. Install the Chrome extension, and Relay will quietly capture context as you work across any of them.",
  },
  {
    q: "Is my data private?",
    a: "Your chat data is stored securely in an encrypted database hosted on Neon. We never sell or share your data with third parties. You can delete your account and all associated data at any time from the Settings page.",
  },
  {
    q: "Do I need to change how I work?",
    a: "Not at all. Relay works in the background. It captures context automatically as you chat with AI tools. When you start a fresh chat, one click inserts your project brief — no copy-pasting needed.",
  },
  {
    q: "Is Relay free?",
    a: "Relay is free during the beta period. We'll announce any pricing changes well in advance, and the core workflow will always have a generous free tier.",
  },
  {
    q: "How does the Chrome extension connect?",
    a: "Sign in on the web, then open the Relay sidepanel in Chrome. Click 'Connect' and the extension pairs with your account automatically using a secure device token. No passwords stored in the extension.",
  },
];

function BlurRevealText({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <p className="px-5 pb-5 text-[14px] leading-relaxed text-gray-500">
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
  );
}

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-[#FAFAF8] px-6 py-24 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-3xl">
        <div data-animate="section">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Questions &amp; answers
          </h2>
        </div>

        <div className="mt-12 space-y-2.5">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow duration-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
              data-animate="faq-item"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 p-5 text-left"
              >
                <span className="text-[15px] font-semibold leading-snug text-gray-900">
                  {faq.q}
                </span>
                <ChevronDown
                  className={`h-[18px] w-[18px] shrink-0 text-gray-400 transition-transform duration-300 ${
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
                    <BlurRevealText text={faq.a} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
