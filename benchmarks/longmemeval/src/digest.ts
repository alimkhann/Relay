import type { SessionDigestShape } from "@relay/shared"

interface SessionTurn {
  role: string
  content: string
}

const decisionPatterns = [/\bdecided to\b/i, /\bchose to\b/i, /\bgoing with\b/i, /\bwill use\b/i]
const constraintPatterns = [/\bcan't\b/i, /\bcannot\b/i, /\bmust\b/i, /\bneed to avoid\b/i, /\bnot allowed\b/i]
const taskPatterns = [/\bneed to\b/i, /\bhave to\b/i, /\bshould\b/i, /\bnext step\b/i, /\bremember to\b/i]
const objectivePatterns = [/\bworking on\b/i, /\btrying to\b/i, /\bgoal is to\b/i, /\bplan to\b/i]

function cleanLine(text: string): string {
  return text.trim().replace(/\s+/g, " ")
}

function collectMatches(turns: SessionTurn[], patterns: RegExp[], limit: number): string[] {
  const results: string[] = []
  for (const turn of turns) {
    const content = cleanLine(turn.content)
    if (!content) continue
    if (patterns.some((pattern) => pattern.test(content))) {
      results.push(content)
    }
    if (results.length >= limit) break
  }
  return results
}

export function buildDeterministicDigest(turns: SessionTurn[]): SessionDigestShape {
  const normalizedTurns = turns.filter((turn) => turn.content && turn.content.trim().length > 0)
  const summaryShort = normalizedTurns
    .slice(0, 4)
    .map((turn) => `${turn.role}: ${cleanLine(turn.content)}`)
    .join(" ")
    .slice(0, 600)

  const objectiveCandidate = normalizedTurns.find((turn) => objectivePatterns.some((pattern) => pattern.test(turn.content)))

  return {
    summaryShort,
    newDecisions: collectMatches(normalizedTurns, decisionPatterns, 3),
    newConstraints: collectMatches(normalizedTurns, constraintPatterns, 3),
    newTasks: collectMatches(normalizedTurns, taskPatterns, 4),
    projectOverviewDelta: null,
    currentObjectiveDelta: objectiveCandidate ? cleanLine(objectiveCandidate.content).slice(0, 320) : null,
    recentProgressDelta: summaryShort || null,
    relevantToolsDelta: [],
    importanceScore: 0.6,
    shouldMerge: true,
  }
}
