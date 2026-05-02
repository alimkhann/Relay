import type {
  ParsedTurn,
  RelayInsertedContextAssistantOutcome,
  RelayInsertedContextKind,
  RelayInsertedContextMetadata,
} from "@relay/shared"
import { normalizeText } from "@relay/shared/utils/text"

interface PendingInsertedContextState {
  packetId: string | null
  insertKind: RelayInsertedContextKind
  insertedContent: string
  insertedContentHash: string
}

interface FilterInsertedContextCaptureInput {
  turns: ParsedTurn[]
  pending: PendingInsertedContextState
}

type FilterInsertedContextCaptureResult =
  | {
      kind: "skip"
      reason: string
      metadata: RelayInsertedContextMetadata
    }
  | {
      kind: "capture"
      turns: ParsedTurn[]
      metadata: RelayInsertedContextMetadata
    }

function normalizeForCompare(value: string) {
  return normalizeText(value).toLowerCase()
}

function tokenize(value: string) {
  return normalizeForCompare(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
}

function buildTokenSet(value: string) {
  return new Set(tokenize(value))
}

function similarity(left: string, right: string) {
  const leftTokens = tokenize(left)
  const rightTokens = tokenize(right)
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0
  }

  const rightSet = new Set(rightTokens)
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length
  return overlap / Math.max(Math.min(leftTokens.length, rightTokens.length), 1)
}

function diffUserDelta(insertedContent: string, userContent: string) {
  const inserted = normalizeText(insertedContent)
  const user = normalizeText(userContent)
  if (!user || normalizeForCompare(inserted) === normalizeForCompare(user)) {
    return { delta: "", deltaKind: "unchanged" as const }
  }

  const containedIndex = user.indexOf(inserted)
  if (containedIndex >= 0) {
    const before = user.slice(0, containedIndex).trim()
    const after = user.slice(containedIndex + inserted.length).trim()
    const delta = normalizeText(`${before} ${after}`)
    return {
      delta,
      deltaKind: delta ? ("appended" as const) : ("unchanged" as const),
    }
  }

  let prefixLength = 0
  const maxPrefix = Math.min(inserted.length, user.length)
  while (prefixLength < maxPrefix && inserted[prefixLength] === user[prefixLength]) {
    prefixLength += 1
  }

  if (prefixLength >= inserted.length * 0.9 && user.length > inserted.length) {
    const delta = normalizeText(user.slice(prefixLength))
    return {
      delta,
      deltaKind: delta ? ("appended" as const) : ("unchanged" as const),
    }
  }

  let suffixLength = 0
  const maxSuffix = Math.min(inserted.length - prefixLength, user.length - prefixLength)
  while (
    suffixLength < maxSuffix &&
    inserted[inserted.length - 1 - suffixLength] === user[user.length - 1 - suffixLength]
  ) {
    suffixLength += 1
  }

  const delta = normalizeText(user.slice(prefixLength, user.length - suffixLength))
  return {
    delta: delta || user,
    deltaKind: "edited" as const,
  }
}

function buildSyntheticUserTurn(insertKind: RelayInsertedContextKind, delta: string): ParsedTurn {
  const label = insertKind === "quick_continuity" ? "continuity brief" : "project brief"
  return {
    role: "user",
    content: `User edits/additions after Relay inserted the ${label}: ${delta}`,
    turnIndex: 0,
  }
}

function classifyAssistantTurn(
  assistantContent: string,
  insertedContent: string,
  userDelta: string,
): { keep: boolean; outcome: RelayInsertedContextAssistantOutcome } {
  const normalizedAssistant = normalizeText(assistantContent)
  if (!normalizedAssistant) {
    return { keep: false, outcome: "none" }
  }

  const novelTokens = tokenize(normalizedAssistant).filter((token) => {
    return !buildTokenSet(`${insertedContent} ${userDelta}`).has(token)
  })
  const overlapInserted = similarity(normalizedAssistant, insertedContent)
  const overlapUserDelta = userDelta ? similarity(normalizedAssistant, userDelta) : 0
  const looksLikeAck =
    /^(ok|okay|sure|understood|got it|sounds good|will do|i('| a)?ll|thanks|thank you|absolutely|certainly)\b/i.test(normalizedAssistant) &&
    normalizedAssistant.length < 240

  if (looksLikeAck && novelTokens.length < 6) {
    return { keep: false, outcome: "dropped_ack" }
  }

  if ((overlapInserted >= 0.72 || overlapUserDelta >= 0.88) && novelTokens.length < 10) {
    return { keep: false, outcome: "dropped_overlap" }
  }

  if (normalizedAssistant.length < 48 && novelTokens.length < 6) {
    return { keep: false, outcome: "dropped_ack" }
  }

  return { keep: true, outcome: "kept_novel" }
}

export function filterInsertedContextCapture(
  input: FilterInsertedContextCaptureInput,
): FilterInsertedContextCaptureResult {
  const lastUserIndex = [...input.turns]
    .map((turn, index) => ({ turn, index }))
    .filter(({ turn }) => turn.role === "user")
    .at(-1)?.index ?? -1

  const rawTurnCount = input.turns.length
  const emptyMetadataBase = {
    kind: input.pending.insertKind,
    packetId: input.pending.packetId,
    insertedContentHash: input.pending.insertedContentHash,
    rawTurnCount,
  }

  if (lastUserIndex < 0) {
    return {
      kind: "skip",
      reason: "Relay skipped capture because the inserted context had no user turn to compare.",
      metadata: {
        ...emptyMetadataBase,
        deltaKind: "unchanged",
        filteredTurnCount: 0,
        assistantOutcome: "none",
      },
    }
  }

  const userTurn = input.turns[lastUserIndex]!
  const { delta, deltaKind } = diffUserDelta(input.pending.insertedContent, userTurn.content)
  const assistantTurns = input.turns
    .slice(lastUserIndex + 1)
    .filter((turn) => turn.role === "assistant")

  let assistantOutcome: RelayInsertedContextAssistantOutcome = "none"
  const keptAssistantTurns: ParsedTurn[] = []
  for (const assistantTurn of assistantTurns) {
    const classification = classifyAssistantTurn(
      assistantTurn.content,
      input.pending.insertedContent,
      delta,
    )
    assistantOutcome = classification.outcome
    if (classification.keep) {
      keptAssistantTurns.push({
        role: "assistant",
        content: normalizeText(assistantTurn.content),
        turnIndex: delta ? 1 + keptAssistantTurns.length : keptAssistantTurns.length,
      })
    }
  }

  const filteredTurns: ParsedTurn[] = []
  if (delta) {
    filteredTurns.push(buildSyntheticUserTurn(input.pending.insertKind, delta))
  }
  filteredTurns.push(...keptAssistantTurns)

  const metadata: RelayInsertedContextMetadata = {
    ...emptyMetadataBase,
    deltaKind: delta
      ? deltaKind
      : keptAssistantTurns.length > 0
        ? "assistant_only"
        : "unchanged",
    filteredTurnCount: filteredTurns.length,
    assistantOutcome,
  }

  if (filteredTurns.length === 0) {
    return {
      kind: "skip",
      reason: "Relay skipped capture because the inserted context was submitted unchanged and the AI only acknowledged or repeated it.",
      metadata,
    }
  }

  return {
    kind: "capture",
    turns: filteredTurns,
    metadata,
  }
}
