import { normalizeText } from "@relay/shared"

const GEMINI_API_BASE = process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"

export const GEMINI_MODELS = {
  digest: {
    primary: "gemini-3.1-flash-lite",
    fallback: "gemini-2.5-flash-lite",
    maxInputTokens: 6_000,
    maxOutputTokens: 1_200
  },
  bootstrap: {
    primary: "gemini-3-flash",
    fallback: "gemini-2.5-flash",
    maxInputTokens: 14_000,
    maxOutputTokens: 2_000
  }
} as const

interface GeminiUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

interface GeminiJsonResult<T> {
  data: T
  primaryModel: string
  actualModel: string
  fallbackUsed: boolean
  tokenUsage: GeminiUsage
}

class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message)
    this.name = "GeminiRequestError"
  }
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? null
}

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4))
}

async function parseError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string; status?: string } }
    return payload.error?.message ?? payload.error?.status ?? `Gemini request failed with status ${response.status}.`
  } catch {
    return `Gemini request failed with status ${response.status}.`
  }
}

function isRetryableStatus(status: number) {
  return status === 404 || status === 429 || status === 500 || status === 503
}

async function countTokens(model: string, prompt: string) {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    return estimateTokenCount(prompt)
  }

  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:countTokens?key=${apiKey}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    })
  })

  if (!response.ok) {
    return estimateTokenCount(prompt)
  }

  const payload = (await response.json()) as { totalTokens?: number }
  return payload.totalTokens ?? estimateTokenCount(prompt)
}

async function generateJson<T>(model: string, systemInstruction: string, prompt: string, maxOutputTokens: number): Promise<{ data: T; tokenUsage: GeminiUsage }> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    throw new GeminiRequestError("Gemini API key is not configured.", 0, false)
  }

  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens
      }
    })
  })

  if (!response.ok) {
    throw new GeminiRequestError(await parseError(response), response.status, isRetryableStatus(response.status))
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>
      }
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
    }
  }

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim()
  if (!text) {
    throw new GeminiRequestError("Gemini returned an empty response.", response.status, false)
  }

  return {
    data: JSON.parse(text) as T,
    tokenUsage: {
      inputTokens: payload.usageMetadata?.promptTokenCount ?? estimateTokenCount(prompt),
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? estimateTokenCount(text),
      totalTokens:
        payload.usageMetadata?.totalTokenCount ??
        (payload.usageMetadata?.promptTokenCount ?? estimateTokenCount(prompt)) +
          (payload.usageMetadata?.candidatesTokenCount ?? estimateTokenCount(text))
    }
  }
}

async function trimPromptToBudget(model: string, prompt: string, maxInputTokens: number) {
  let nextPrompt = normalizeText(prompt)
  let totalTokens = await countTokens(model, nextPrompt)

  while (totalTokens > maxInputTokens && nextPrompt.length > 1200) {
    nextPrompt = nextPrompt.slice(0, Math.floor(nextPrompt.length * 0.85))
    totalTokens = await countTokens(model, nextPrompt)
  }

  return { prompt: nextPrompt, tokens: totalTokens }
}

export async function runGeminiJsonWithFallback<T>(input: {
  primaryModel: string
  fallbackModel: string
  systemInstruction: string
  prompt: string
  maxInputTokens: number
  maxOutputTokens: number
}): Promise<GeminiJsonResult<T>> {
  const primaryPrompt = await trimPromptToBudget(input.primaryModel, input.prompt, input.maxInputTokens)

  try {
    const result = await generateJson<T>(input.primaryModel, input.systemInstruction, primaryPrompt.prompt, input.maxOutputTokens)
    return {
      data: result.data,
      primaryModel: input.primaryModel,
      actualModel: input.primaryModel,
      fallbackUsed: false,
      tokenUsage: result.tokenUsage
    }
  } catch (error) {
    if (!(error instanceof GeminiRequestError) || !error.retryable) {
      throw error
    }
  }

  const fallbackPrompt = await trimPromptToBudget(input.fallbackModel, input.prompt, input.maxInputTokens)
  const fallbackResult = await generateJson<T>(input.fallbackModel, input.systemInstruction, fallbackPrompt.prompt, input.maxOutputTokens)

  return {
    data: fallbackResult.data,
    primaryModel: input.primaryModel,
    actualModel: input.fallbackModel,
    fallbackUsed: true,
    tokenUsage: fallbackResult.tokenUsage
  }
}
