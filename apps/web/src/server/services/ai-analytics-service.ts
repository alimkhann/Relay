import { logServerEvent } from "@/server/logging/logger"

interface TokenUsageLike {
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
}

interface GeminiModelPricing {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
  source: string
}

export interface AiRequestCompletedInput {
  userId?: string | null
  projectId?: string | null
  sessionId?: string | null
  requestId?: string | null
  flowId?: string | null
  surface?: "web-api" | "web-dashboard"
  operation: string
  jobKind: string
  primaryModel?: string | null
  actualModel?: string | null
  fallbackUsed?: boolean
  tokenUsage?: TokenUsageLike | null
  latencyMs?: number | null
  success: boolean
  failurePhase?: string | null
}

function toNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function resolveGeminiModelPricing(model: string | null | undefined): GeminiModelPricing | null {
  if (!model) {
    return null
  }

  const normalized = model.toLowerCase()

  if (normalized.includes("gemini-3-pro")) {
    return {
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 12,
      source: "https://ai.google.dev/pricing",
    }
  }

  if (normalized.includes("gemini-3-flash")) {
    return {
      inputUsdPerMillion: 0.5,
      outputUsdPerMillion: 3,
      source: "https://ai.google.dev/pricing",
    }
  }

  if (normalized.includes("gemini-2.5-pro")) {
    return {
      inputUsdPerMillion: 1.25,
      outputUsdPerMillion: 10,
      source: "https://ai.google.dev/pricing",
    }
  }

  if (normalized.includes("flash-lite")) {
    return {
      inputUsdPerMillion: 0.1,
      outputUsdPerMillion: 0.4,
      source: "https://ai.google.dev/pricing",
    }
  }

  if (normalized.includes("gemini-2.5-flash") || normalized.includes("gemini-2.0-flash")) {
    return {
      inputUsdPerMillion: 0.3,
      outputUsdPerMillion: 2.5,
      source: "https://ai.google.dev/pricing",
    }
  }

  return null
}

export function estimateGeminiCostUsd(input: {
  model?: string | null
  tokenUsage?: TokenUsageLike | null
}) {
  const pricing = resolveGeminiModelPricing(input.model ?? null)
  const tokensIn = toNumber(input.tokenUsage?.inputTokens)
  const tokensOut = toNumber(input.tokenUsage?.outputTokens)

  if (!pricing) {
    return {
      estimatedCostUsd: 0,
      estimationMethod: "missing_model_pricing",
      pricingSource: null,
    }
  }

  const estimatedCostUsd =
    (tokensIn / 1_000_000) * pricing.inputUsdPerMillion +
    (tokensOut / 1_000_000) * pricing.outputUsdPerMillion

  return {
    estimatedCostUsd: roundUsd(estimatedCostUsd),
    estimationMethod: "gemini_pricing_table",
    pricingSource: pricing.source,
  }
}

export async function emitAiRequestCompleted(input: AiRequestCompletedInput) {
  const actualModel = input.actualModel ?? input.primaryModel ?? null
  const pricing = estimateGeminiCostUsd({
    model: actualModel,
    tokenUsage: input.tokenUsage,
  })

  await logServerEvent({
    level: input.success ? "info" : "warn",
    surface: input.surface ?? "web-api",
    area: "ai",
    event: "ai_request_completed",
    message: input.success
      ? `Completed AI request for ${input.operation}.`
      : `AI request failed for ${input.operation}.`,
    userId: input.userId ?? null,
    projectId: input.projectId ?? null,
    sessionId: input.sessionId ?? null,
    requestId: input.requestId ?? null,
    flowId: input.flowId ?? null,
    context: {
      provider: "gemini",
      operation: input.operation,
      jobKind: input.jobKind,
      primaryModel: input.primaryModel ?? null,
      actualModel,
      model: actualModel,
      fallbackUsed: input.fallbackUsed ?? false,
      tokensIn: toNumber(input.tokenUsage?.inputTokens),
      tokensOut: toNumber(input.tokenUsage?.outputTokens),
      tokensTotal: toNumber(input.tokenUsage?.totalTokens),
      latencyMs: toNumber(input.latencyMs),
      estimatedCostUsd: pricing.estimatedCostUsd,
      success: input.success,
      failurePhase: input.failurePhase ?? null,
      estimationMethod: pricing.estimationMethod,
      pricingSource: pricing.pricingSource,
    },
  }).catch(() => {})

  return pricing
}
