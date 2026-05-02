import OpenAI from "openai"
import type { CostTracker } from "./cost"

// Relay's memory_items.embedding column is vector(768). text-embedding-3-small
// is natively 1536-dim but supports the `dimensions` parameter to truncate.
const EMBEDDING_DIM = 768

export class Embedder {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
    private readonly cost: CostTracker,
    private readonly dryRun: boolean,
  ) {}

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    if (this.dryRun) {
      // Deterministic pseudo-embedding from hash — good enough to round-trip
      // through pgvector and exercise hybrid search.
      return texts.map((t) => stubEmbedding(t, EMBEDDING_DIM))
    }
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: EMBEDDING_DIM,
    })
    this.cost.record(this.model, response.usage.prompt_tokens, 0)
    return response.data.map((d) => d.embedding)
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text])
    return vec
  }
}

function stubEmbedding(seed: string, dim: number): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const out = new Array(dim)
  for (let i = 0; i < dim; i++) {
    h = Math.imul(h ^ i, 2654435761)
    out[i] = ((h >>> 0) / 0xffffffff) * 2 - 1
  }
  // L2-normalize
  let norm = 0
  for (const v of out) norm += v * v
  norm = Math.sqrt(norm) || 1
  return out.map((v) => v / norm)
}
