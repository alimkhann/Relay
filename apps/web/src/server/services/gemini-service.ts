import { normalizeText } from "@relay/shared"

const GEMINI_API_BASE = process.env.GEMINI_API_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"
const MODEL_UNAVAILABLE_CACHE_MS = 15 * 60 * 1000

function envModel(key: string, fallback: string) {
  const value = process.env[key]?.trim()
  return value || fallback
}

export const GEMINI_MODELS = {
  digest: {
    primary: envModel("GEMINI_MODEL_DIGEST_PRIMARY", "gemini-3.1-flash-lite"),
    fallback: envModel("GEMINI_MODEL_DIGEST_FALLBACK", "gemini-2.5-flash-lite"),
    maxInputTokens: 6_000,
    maxOutputTokens: 1_200
  },
  bootstrap: {
    primary: envModel("GEMINI_MODEL_BOOTSTRAP_PRIMARY", "gemini-3-flash-preview"),
    fallback: envModel("GEMINI_MODEL_BOOTSTRAP_FALLBACK", "gemini-2.5-flash"),
    maxInputTokens: 14_000,
    maxOutputTokens: 2_000
  },
  adjudication: {
    primary: envModel("GEMINI_MODEL_ADJUDICATION_PRIMARY", "gemini-3.1-flash-lite"),
    fallback: envModel("GEMINI_MODEL_ADJUDICATION_FALLBACK", "gemini-2.5-flash-lite"),
    maxInputTokens: 4_000,
    maxOutputTokens: 500,
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

export type GeminiFailurePhase = "preflight" | "count_tokens" | "generate" | "json_parse"
export type GeminiStage = "count_tokens_primary" | "generate_primary" | "count_tokens_fallback" | "generate_fallback"

const unavailableModelCache = new Map<string, number>()

export class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly phase: GeminiFailurePhase
  ) {
    super(message)
    this.name = "GeminiRequestError"
  }
}

function getGeminiApiKey() {
  const rawKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? null
  if (!rawKey) return null
  const normalizedKey = rawKey.replace(/\\n/g, "").trim()
  return normalizedKey || null
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
  return status === 403 || status === 404 || status === 429 || status === 500 || status === 503
}

function isModelUnavailableStatus(status: number) {
  return status === 403 || status === 404
}

function getCachedUnavailableError(model: string, phase: GeminiFailurePhase) {
  const expiresAt = unavailableModelCache.get(model)
  if (!expiresAt) return null
  if (expiresAt <= Date.now()) {
    unavailableModelCache.delete(model)
    return null
  }

  return new GeminiRequestError(`Gemini model ${model} is temporarily unavailable and Relay cached that failure.`, 403, true, phase)
}

function rememberUnavailableModel(model: string) {
  unavailableModelCache.set(model, Date.now() + MODEL_UNAVAILABLE_CACHE_MS)
}

export function describeGeminiError(error: unknown) {
  if (!(error instanceof GeminiRequestError)) {
    return null
  }

  return {
    message: error.message,
    status: error.status,
    retryable: error.retryable,
    phase: error.phase
  }
}

async function generateJson<T>(model: string, systemInstruction: string, prompt: string, maxOutputTokens: number, signal?: AbortSignal): Promise<{ data: T; tokenUsage: GeminiUsage }> {
  const cachedError = getCachedUnavailableError(model, "generate")
  if (cachedError) {
    throw cachedError
  }

  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    throw new GeminiRequestError("Gemini API key is not configured.", 0, false, "preflight")
  }

  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey
    },
    signal,
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
    const message = await parseError(response)
    if (isModelUnavailableStatus(response.status)) {
      rememberUnavailableModel(model)
    }

    throw new GeminiRequestError(message, response.status, isRetryableStatus(response.status), "generate")
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
    throw new GeminiRequestError("Gemini returned an empty response.", response.status, false, "generate")
  }

  let data: T
  try {
    data = JSON.parse(text) as T
  } catch {
    throw new GeminiRequestError("Gemini returned invalid JSON.", response.status, false, "json_parse")
  }

  return {
    data,
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

export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface GeminiContent {
  role: "user" | "model" | "function"
  parts: Array<
    | { text: string }
    // Base64 image/data part for vision input (attachments).
    | { inlineData: { mimeType: string; data: string } }
    // Gemini 3 returns an opaque thoughtSignature on functionCall parts that
    // MUST be echoed back unchanged on the model turn, or the follow-up
    // request is rejected ("function call is missing a thought_signature").
    | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
    | { functionResponse: { name: string; response: Record<string, unknown> } }
  >
}

export interface GeminiAgentStepResult {
  text: string
  functionCalls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }>
  finishReason: string | null
  tokenUsage: GeminiUsage
}

/**
 * Single non-streaming agent turn with function calling. The caller owns the
 * bounded loop (execute tools, append functionResponse, call again).
 */
export async function runGeminiAgentStep(input: {
  model: string
  systemInstruction: string
  contents: GeminiContent[]
  tools: GeminiFunctionDeclaration[]
  maxOutputTokens: number
  signal?: AbortSignal
}): Promise<GeminiAgentStepResult> {
  const cachedError = getCachedUnavailableError(input.model, "generate")
  if (cachedError) {
    throw cachedError
  }

  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    throw new GeminiRequestError("Gemini API key is not configured.", 0, false, "preflight")
  }

  const response = await fetch(`${GEMINI_API_BASE}/models/${input.model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey
    },
    signal: input.signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemInstruction }] },
      contents: input.contents,
      tools: input.tools.length > 0 ? [{ functionDeclarations: input.tools }] : undefined,
      generationConfig: {
        maxOutputTokens: input.maxOutputTokens
      }
    })
  })

  if (!response.ok) {
    const message = await parseError(response)
    if (isModelUnavailableStatus(response.status)) {
      rememberUnavailableModel(input.model)
    }
    throw new GeminiRequestError(message, response.status, isRetryableStatus(response.status), "generate")
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      finishReason?: string
      content?: {
        parts?: Array<{
          text?: string
          functionCall?: { name?: string; args?: Record<string, unknown> }
          thoughtSignature?: string
        }>
      }
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
    }
  }

  const candidate = payload.candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim()
  const functionCalls = parts
    .filter((part) => part.functionCall?.name)
    .map((part) => ({
      name: String(part.functionCall?.name),
      args: (part.functionCall?.args as Record<string, unknown>) ?? {},
      thoughtSignature: part.thoughtSignature
    }))

  // Gemini omits usageMetadata on some function-calling responses. Estimate
  // from the serialized request so the monthly token cap is never fed zeros.
  const inputTokens =
    payload.usageMetadata?.promptTokenCount ?? estimateTokenCount(JSON.stringify(input.contents))
  const outputTokens = payload.usageMetadata?.candidatesTokenCount ?? estimateTokenCount(text)

  return {
    text,
    functionCalls,
    finishReason: candidate?.finishReason ?? null,
    tokenUsage: {
      inputTokens,
      outputTokens,
      totalTokens: payload.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens
    }
  }
}

function trimPromptToBudget(prompt: string, maxInputTokens: number) {
  let nextPrompt = normalizeText(prompt)
  let totalTokens = estimateTokenCount(nextPrompt)

  while (totalTokens > maxInputTokens && nextPrompt.length > 1200) {
    nextPrompt = nextPrompt.slice(0, Math.floor(nextPrompt.length * 0.85))
    totalTokens = estimateTokenCount(nextPrompt)
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
  signal?: AbortSignal
  onStage?: (stage: GeminiStage, details: { model: string; fallbackUsed: boolean }) => void | Promise<void>
}): Promise<GeminiJsonResult<T>> {
  const emitStage = async (stage: GeminiStage, model: string, fallbackUsed: boolean) => {
    await input.onStage?.(stage, { model, fallbackUsed })
  }

  try {
    await emitStage("count_tokens_primary", input.primaryModel, false)
    const primaryPrompt = trimPromptToBudget(input.prompt, input.maxInputTokens)
    await emitStage("generate_primary", input.primaryModel, false)
    const result = await generateJson<T>(input.primaryModel, input.systemInstruction, primaryPrompt.prompt, input.maxOutputTokens, input.signal)
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

  await emitStage("count_tokens_fallback", input.fallbackModel, true)
  const fallbackPrompt = trimPromptToBudget(input.prompt, input.maxInputTokens)
  await emitStage("generate_fallback", input.fallbackModel, true)
  const fallbackResult = await generateJson<T>(input.fallbackModel, input.systemInstruction, fallbackPrompt.prompt, input.maxOutputTokens, input.signal)

  return {
    data: fallbackResult.data,
    primaryModel: input.primaryModel,
    actualModel: input.fallbackModel,
    fallbackUsed: true,
    tokenUsage: fallbackResult.tokenUsage
  }
}
