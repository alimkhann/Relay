/**
 * LIVE chatbot + agentic QA loop — real Gemini, dev DB. Gated behind
 * RELAY_LIVE_AGENT_HARNESS=1; never runs in CI.
 *
 * Standards checked:
 *  - plain conversation works (no tool needed, no errors, no fallback text)
 *  - language/tone mirroring (Russian in → Russian out)
 *  - multi-turn continuity in one chat
 *  - implicit durable facts get saved without being asked
 *  - web_search self-invocation on freshness questions
 *  - "what do you know about me" works
 */
import { describe, expect, it } from "vitest"

const LIVE = process.env.RELAY_LIVE_AGENT_HARNESS === "1"
const HARNESS_USER_ID = process.env.RELAY_HARNESS_USER_ID ?? ""

const FALLBACK_TEXT = "couldn't produce a reliable response"

describe.runIf(LIVE)("live chatbot QA loop", () => {
  it(
    "conversational + agentic standards",
    async () => {
      const { runAssistantTurn } = await import("./assistant-agent-service")
      const viewer = { userId: HARNESS_USER_ID, mode: "session" as const }

      async function turn(message: string, opts: { chatId?: string | null } = {}) {
        const events: Array<Record<string, unknown>> = []
        const gen = runAssistantTurn(
          viewer,
          { chatId: opts.chatId ?? null, surface: "dashboard", projectId: null, message },
          { plan: "pro", maxSteps: 12 },
        )
        for await (const event of gen) events.push(event as unknown as Record<string, unknown>)
        const text = events.filter((e) => e.type === "text").map((e) => e.delta).join("")
        return {
          text,
          chatId: (events.find((e) => e.type === "chat") as { chatId?: string } | undefined)?.chatId ?? null,
          errors: events.filter((e) => e.type === "error"),
          toolsUsed: events.filter((e) => e.type === "tool_start").map((e) => e.tool),
          toolResults: events.filter((e) => e.type === "tool_result"),
          pending: events.filter((e) => e.type === "pending_action"),
        }
      }

      const failures: string[] = []
      const check = (name: string, condition: boolean, detail: string) => {
        if (!condition) failures.push(`${name}: ${detail}`)
        console.log(`${condition ? "✓" : "✗"} ${name}${condition ? "" : ` — ${detail}`}`)
      }

      // ── 1. small talk, multi-turn, one chat ──
      const c1a = await turn("hey, how's it going?")
      check("smalltalk no errors", c1a.errors.length === 0, JSON.stringify(c1a.errors))
      check("smalltalk has text", c1a.text.length > 0 && !c1a.text.includes(FALLBACK_TEXT), c1a.text.slice(0, 120))
      console.log("  reply:", c1a.text.slice(0, 160))

      const c1b = await turn("what do you think makes a good morning routine? keep it short", { chatId: c1a.chatId })
      check("opinion q no errors", c1b.errors.length === 0, JSON.stringify(c1b.errors))
      check("opinion q answered", c1b.text.length > 20, c1b.text.slice(0, 120))
      console.log("  reply:", c1b.text.slice(0, 160))

      // ── 2. language mirroring ──
      const c2 = await turn("привет! расскажи коротко, что ты умеешь?")
      check("russian no errors", c2.errors.length === 0, JSON.stringify(c2.errors))
      check("russian reply in russian", /[а-яё]/i.test(c2.text), c2.text.slice(0, 120))
      console.log("  reply:", c2.text.slice(0, 160))

      // ── 3. implicit durable fact → saved without being asked ──
      const c3 = await turn(
        "by the way, i switched my main editor to Zed last week and i'm loving it so far",
      )
      check("implicit fact no errors", c3.errors.length === 0, JSON.stringify(c3.errors))
      const savedImplicitly =
        c3.toolResults.some((e) => (e as { result?: { tool?: string } }).result?.tool === "add_memory") ||
        c3.toolResults.some(
          (e) => (e as { result?: { tool?: string } }).result?.tool === "personal_memory_autowrite",
        )
      check("implicit fact saved", savedImplicitly, `tools: ${c3.toolsUsed.join(",")} | ${c3.text.slice(0, 120)}`)
      console.log("  reply:", c3.text.slice(0, 160))

      // ── 4. web_search self-invocation on freshness question ──
      const c4 = await turn("what's the most recent stable Node.js LTS version?")
      check("freshness no errors", c4.errors.length === 0, JSON.stringify(c4.errors))
      check(
        "web_search self-invoked",
        c4.toolsUsed.includes("web_search"),
        `tools: ${c4.toolsUsed.join(",")} | ${c4.text.slice(0, 120)}`,
      )
      console.log("  reply:", c4.text.slice(0, 160))

      // ── 5. memory recall about the user ──
      const c5 = await turn("what do you know about me?")
      check("about-me no errors", c5.errors.length === 0, JSON.stringify(c5.errors))
      check("about-me substantive", c5.text.length > 40 && !c5.text.includes(FALLBACK_TEXT), c5.text.slice(0, 120))
      console.log("  reply:", c5.text.slice(0, 160))

      // ── 6. product question (relay_knowledge path) ──
      const c6 = await turn("how do i connect my coding agent to relay?")
      check("product q no errors", c6.errors.length === 0, JSON.stringify(c6.errors))
      check("product q mentions wizard/mcp", /wizard|mcp/i.test(c6.text), c6.text.slice(0, 160))
      console.log("  reply:", c6.text.slice(0, 160))

      // ── cleanup the implicit-fact memory so reruns stay clean ──
      const cleanup = await turn("delete the memory about me switching to Zed", { chatId: c3.chatId })
      const pendingIds = cleanup.pending
        .map((e) => (e as { action?: { id?: string } }).action?.id)
        .filter((id): id is string => typeof id === "string")
      if (pendingIds.length > 0) {
        const gen = runAssistantTurn(
          viewer,
          {
            chatId: cleanup.chatId,
            surface: "dashboard",
            projectId: null,
            message: "Allow pending actions",
            actionDecision: { actionId: pendingIds[0]!, actionIds: pendingIds, decision: "allow" },
          },
          { plan: "pro", maxSteps: 4 },
        )
        for await (const _event of gen) {
          // drain
        }
      }

      console.log(failures.length === 0 ? "\nALL CHECKS PASSED" : `\nFAILURES (${failures.length}):\n${failures.join("\n")}`)
      expect(failures).toEqual([])
    },
    420_000,
  )
})
