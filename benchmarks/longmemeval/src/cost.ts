// Running cost tracker with a hard ceiling.
// Prices per 1M tokens (USD) — April 2026 published rates.
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
}

export class CostTracker {
  private spend = 0
  private calls = 0

  constructor(private readonly ceiling: number) {}

  record(model: string, inputTokens: number, outputTokens: number) {
    const price = PRICES[model]
    if (!price) {
      console.warn(`[cost] unknown model "${model}" — not tracked`)
      return
    }
    const cost =
      (inputTokens / 1_000_000) * price.input +
      (outputTokens / 1_000_000) * price.output
    this.spend += cost
    this.calls += 1

    if (this.spend > this.ceiling) {
      throw new Error(
        `[cost] kill-switch tripped: spent $${this.spend.toFixed(4)} exceeds ceiling $${this.ceiling.toFixed(2)} after ${this.calls} calls`,
      )
    }
  }

  summary() {
    return {
      totalUsd: Number(this.spend.toFixed(4)),
      calls: this.calls,
      ceiling: this.ceiling,
    }
  }
}
