import type { MemoryRepository } from "@relay/db"

const GEMINI_API_BASE = process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"

export const EMBEDDING_MODEL = "text-embedding-004"

const BATCH_LIMIT = 100

function getGeminiApiKey() {
  const rawKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? null
  if (!rawKey) return null
  const normalizedKey = rawKey.replace(/\\n/g, "").trim()
  return normalizedKey || null
}

function buildEmbeddingText(title: string | null, content: string): string {
  return title ? `${title}: ${content}` : content
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Cannot generate embeddings.")
  }

  const response = await fetch(
    `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] }
      })
    }
  )

  if (!response.ok) {
    const message = await parseError(response)
    throw new Error(`Gemini embedding request failed (${response.status}): ${message}`)
  }

  const payload = (await response.json()) as {
    embedding?: { values?: number[] }
  }

  const values = payload.embedding?.values
  if (!values?.length) {
    throw new Error("Gemini returned an empty embedding.")
  }

  return values
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (texts.length === 1) return [await generateEmbedding(texts[0]!)]

  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Cannot generate embeddings.")
  }

  const results: number[][] = []

  for (let offset = 0; offset < texts.length; offset += BATCH_LIMIT) {
    const chunk = texts.slice(offset, offset + BATCH_LIMIT)

    const response = await fetch(
      `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: chunk.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] }
          }))
        })
      }
    )

    if (!response.ok) {
      const message = await parseError(response)
      throw new Error(`Gemini batch embedding request failed (${response.status}): ${message}`)
    }

    const payload = (await response.json()) as {
      embeddings?: Array<{ values?: number[] }>
    }

    const embeddings = payload.embeddings
    if (!embeddings?.length) {
      throw new Error("Gemini returned empty batch embeddings.")
    }

    for (const embedding of embeddings) {
      if (!embedding.values?.length) {
        throw new Error("Gemini returned an empty embedding in batch response.")
      }
      results.push(embedding.values)
    }
  }

  return results
}

export async function embedMemoryItem(
  item: { id: string; title: string | null; content: string },
  repos: { memory: MemoryRepository }
): Promise<void> {
  const text = buildEmbeddingText(item.title, item.content)
  const embedding = await generateEmbedding(text)
  await repos.memory.updateEmbedding(item.id, embedding, EMBEDDING_MODEL)
}

export async function embedMemoryItems(
  items: Array<{ id: string; title: string | null; content: string }>,
  repos: { memory: MemoryRepository }
): Promise<number> {
  if (items.length === 0) return 0

  let embeddedCount = 0

  for (let offset = 0; offset < items.length; offset += BATCH_LIMIT) {
    const chunk = items.slice(offset, offset + BATCH_LIMIT)
    const texts = chunk.map((item) => buildEmbeddingText(item.title, item.content))

    let embeddings: number[][]
    try {
      embeddings = await generateEmbeddings(texts)
    } catch (error) {
      console.error(`[embedding-service] Batch embedding failed for chunk at offset ${offset}:`, error)
      continue
    }

    const batchUpdates: Array<{ id: string; embedding: number[]; model: string }> = []

    for (let i = 0; i < chunk.length; i++) {
      const embedding = embeddings[i]
      if (embedding) {
        batchUpdates.push({ id: chunk[i]!.id, embedding, model: EMBEDDING_MODEL })
      }
    }

    if (batchUpdates.length > 0) {
      try {
        await repos.memory.updateEmbeddingsBatch(batchUpdates)
        embeddedCount += batchUpdates.length
      } catch (error) {
        console.error(`[embedding-service] Batch DB update failed for chunk at offset ${offset}:`, error)
      }
    }
  }

  return embeddedCount
}

export async function backfillMissingEmbeddings(
  repos: { memory: MemoryRepository },
  limit?: number
): Promise<number> {
  const items = await repos.memory.getItemsWithoutEmbeddings(limit)
  if (items.length === 0) return 0

  return embedMemoryItems(
    items.map((item) => ({ id: item.id, title: item.title, content: item.content })),
    repos
  )
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string; status?: string } }
    return payload.error?.message ?? payload.error?.status ?? `Request failed with status ${response.status}.`
  } catch {
    return `Request failed with status ${response.status}.`
  }
}
