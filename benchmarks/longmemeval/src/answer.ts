import OpenAI from "openai"
import type { CostTracker } from "./cost"
import type { RetrievedChunk } from "./retrieve"

const SYSTEM_PROMPT = `You are a chat assistant answering a question about a conversation history.
You will be given relevant snippets retrieved from that history and a question.

- If the question asks for a fact (e.g. "what did I do on date X", "which of A/B did I prefer"), answer using only information in the snippets.
- If the question asks for a recommendation, suggestion, or advice (e.g. "can you suggest...", "any tips for..."), use the snippets to infer the user's preferences, habits, or situation, and give a response that aligns with them. Reference the specific preferences from the snippets in your answer.
- Only respond with exactly "I don't know." if the snippets contain neither the fact nor enough context to personalize a recommendation.

Keep answers concise.`

export async function answerQuestion(opts: {
  client: OpenAI
  model: string
  cost: CostTracker
  question: string
  questionDate: string
  chunks: RetrievedChunk[]
  dryRun: boolean
}): Promise<string> {
  if (opts.dryRun) {
    const topContent = opts.chunks[0]?.content ?? ""
    return `[DRY RUN] top chunk: ${topContent.slice(0, 80)}`
  }

  const context = opts.chunks
    .map((c, i) => {
      const whenRaw = c.capturedAt ?? c.session_date
      const when = whenRaw ? ` (${whenRaw.slice(0, 10)}` : ""
      const surface = c.sourceSurface ? `, ${c.sourceSurface})` : when ? ")" : ""
      const header = when ? `${when}${surface}` : ""
      const role = c.role ? `[${c.role}]` : ""
      return `#${i + 1}${header} ${role}\n${c.content}`
    })
    .join("\n\n---\n\n")

  const userPrompt = `Current date: ${opts.questionDate}

Conversation snippets:
${context}

Question: ${opts.question}`

  const response = await opts.client.chat.completions.create({
    model: opts.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0,
  })

  opts.cost.record(
    opts.model,
    response.usage?.prompt_tokens ?? 0,
    response.usage?.completion_tokens ?? 0,
  )

  return response.choices[0]?.message?.content?.trim() ?? ""
}
