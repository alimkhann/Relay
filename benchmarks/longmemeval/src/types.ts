// LongMemEval dataset shapes (Oracle variant).

export interface LongMemEvalTurn {
  role: "user" | "assistant"
  content: string
  has_answer?: boolean
}

export type LongMemEvalSession = LongMemEvalTurn[]

export interface LongMemEvalInstance {
  question_id: string
  question_type: string
  question: string
  answer: string
  question_date: string
  haystack_session_ids: string[]
  haystack_dates: string[]
  haystack_sessions: LongMemEvalSession[]
  answer_session_ids?: string[]
}

export interface HypothesisLine {
  question_id: string
  hypothesis: string
}
