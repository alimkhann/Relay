export const memoryStorageLayers = [
  "episode",
  "fact",
  "observation",
  "entity",
  "decision",
  "commitment",
  "task",
  "constraint",
  "preference",
  "artifact",
  "source",
  "summary",
  "brief",
] as const

export const memoryUserBuckets = [
  "note",
  "decision",
  "constraint",
  "requirement",
  "task",
  "artifact",
] as const

export const memoryInternalLayerByUserBucket = {
  note: "observation",
  decision: "decision",
  constraint: "constraint",
  requirement: "commitment",
  task: "task",
  artifact: "artifact",
} as const
