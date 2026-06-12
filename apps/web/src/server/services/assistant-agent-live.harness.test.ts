/**
 * LIVE agent harness — exercises the real runAssistantTurn against the dev DB
 * and the real Gemini API. Never runs in CI: gated behind
 * RELAY_LIVE_AGENT_HARNESS=1 (set it and load apps/web/.env.local first).
 *
 * Purpose: reproduce the "ask it to do several actions at once" failures the
 * user reported across dashboard/extension/telegram (same backend turn).
 */
import { describe, expect, it } from "vitest"

const LIVE = process.env.RELAY_LIVE_AGENT_HARNESS === "1"
const HARNESS_USER_ID = process.env.RELAY_HARNESS_USER_ID ?? ""

describe.runIf(LIVE)("live agent harness", () => {
  it(
    "multi-action turns",
    async () => {
      const { runAssistantTurn } = await import("./assistant-agent-service")
      const viewer = { userId: HARNESS_USER_ID, mode: "session" as const }

      async function turn(message: string, opts: { chatId?: string | null } = {}) {
        const events: Array<Record<string, unknown>> = []
        const gen = runAssistantTurn(
          viewer,
          {
            chatId: opts.chatId ?? null,
            surface: "dashboard",
            projectId: null,
            message,
          },
          { plan: "pro", maxSteps: 12 },
        )
        for await (const event of gen) events.push(event as unknown as Record<string, unknown>)
        const text = events
          .filter((e) => e.type === "text")
          .map((e) => e.delta)
          .join("")
        const toolResults = events.filter((e) => e.type === "tool_result")
        const pending = events.filter((e) => e.type === "pending_action")
        const errors = events.filter((e) => e.type === "error")
        const chatId = (events.find((e) => e.type === "chat") as { chatId?: string } | undefined)
          ?.chatId
        return { events, text, toolResults, pending, errors, chatId }
      }

      // ── scenario 1: several non-destructive writes in one message ──
      const s1 = await turn(
        "Save three things to memory for my harness test: a decision that we use HARNESS-postgres, a constraint that HARNESS-budget is $50/month, and a task to HARNESS-ship the telegram bot.",
      )
      console.log("\n=== S1 multi-write ===")
      console.log("text:", s1.text.slice(0, 400))
      console.log("toolResults:", s1.toolResults.length, "pending:", s1.pending.length, "errors:", JSON.stringify(s1.errors))

      // ── scenario 2: read + write mixed ──
      const s2 = await turn(
        "List my projects, then save a note that says HARNESS-mixed-test-note.",
      )
      console.log("\n=== S2 read+write ===")
      console.log("text:", s2.text.slice(0, 400))
      console.log("toolResults:", s2.toolResults.length, "pending:", s2.pending.length, "errors:", JSON.stringify(s2.errors))

      // ── scenario 3: destructive + non-destructive in one message ──
      const s3 = await turn(
        "Archive the HARNESS-mixed-test-note memory item AND save a new decision that HARNESS-mixed-destructive works.",
      )
      console.log("\n=== S3 mixed destructive ===")
      console.log("text:", s3.text.slice(0, 400))
      console.log(
        "toolResults:", s3.toolResults.length,
        "pending:", s3.pending.length,
        "pendingTools:", s3.pending.map((p) => (p.action as { tool?: string })?.tool).join(","),
        "errors:", JSON.stringify(s3.errors),
      )

      // ── scenario 4: several destructive at once ──
      const s4 = await turn(
        "Archive every memory item that starts with HARNESS- in one go.",
      )
      console.log("\n=== S4 bulk destructive ===")
      console.log("text:", s4.text.slice(0, 400))
      console.log("toolResults:", s4.toolResults.length, "pending:", s4.pending.length, "errors:", JSON.stringify(s4.errors))

      // ── scenario 5: noun-less follow-up in same chat ──
      const s5 = await turn("now delete them all permanently", { chatId: s4.chatId })
      console.log("\n=== S5 follow-up ===")
      console.log("text:", s5.text.slice(0, 400))
      console.log("toolResults:", s5.toolResults.length, "pending:", s5.pending.length, "errors:", JSON.stringify(s5.errors))

      expect(true).toBe(true)
    },
    240_000,
  )
})
