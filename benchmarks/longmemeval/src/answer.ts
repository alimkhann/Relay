import OpenAI from "openai"
import type { CostTracker } from "./cost"
import { analyzeBenchmarkQuery } from "./query"
import {
  buildBenchmarkEvidenceTable,
  buildBenchmarkTemporalHint,
  buildBenchmarkUpdateHint,
  renderBenchmarkEvidenceTable,
} from "./reasoning"
import type { RetrievedChunk } from "./retrieve"

const SYSTEM_PROMPT = `You are a chat assistant answering a question about a conversation history.
You will be given relevant snippets retrieved from that history and a question.

- If the question asks for a fact (e.g. "what did I do on date X", "which of A/B did I prefer"), answer using only information in the snippets.
- If the question asks for a recommendation, suggestion, or advice (e.g. "can you suggest...", "any tips for..."), use the snippets to infer the user's preferences, habits, or situation, and give a response that aligns with them. Reference the specific preferences from the snippets in your answer.
- Prefer a best-supported answer over abstaining. If the evidence is partial but points clearly in one direction, answer with the most likely conclusion from the retrieved evidence.
- Only respond with exactly "I don't know." if the retrieved evidence is truly insufficient to support any grounded answer at all.

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

  const analysis = analyzeBenchmarkQuery(opts.question, { referenceDate: opts.questionDate })
  const evidenceTable = buildBenchmarkEvidenceTable({ analysis, chunks: opts.chunks, referenceDate: opts.questionDate })
  const temporalHint = buildBenchmarkTemporalHint(evidenceTable)
  const updateHint = buildBenchmarkUpdateHint(evidenceTable)

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

Retrieved context:
${context}

Evidence table:
${renderBenchmarkEvidenceTable(evidenceTable)}

Resolved temporal hint:
- earliest: ${temporalHint.earliest?.content ?? "n/a"}
- latest: ${temporalHint.latest?.content ?? "n/a"}
- elapsed days: ${temporalHint.elapsedDays ?? "n/a"}
- elapsed weeks: ${temporalHint.elapsedWeeks ?? "n/a"}
- order: ${temporalHint.order}

Resolved update hint:
- current: ${updateHint.current?.content ?? "n/a"}
- previous: ${updateHint.previous?.content ?? "n/a"}
- changed at: ${updateHint.changedAt ?? "n/a"}

Reasoning mode: ${analysis.reasoningMode}

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
