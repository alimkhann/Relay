#!/usr/bin/env node
// Merge updated preference labels into the main eval-results file and
// recompute overall + per-category accuracy.
import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(__dirname, "..", "data")

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

const dataset = JSON.parse(readFileSync(`${DATA}/longmemeval_oracle.json`, "utf8"))
const typeById = new Map(dataset.map((x) => [x.question_id, x.question_type]))

const main = readJsonl(`${DATA}/hypotheses.jsonl.eval-results-gpt-4o`)
const prefNew = readJsonl(`${DATA}/preference-hypotheses.jsonl.eval-results-gpt-4o`)
const prefById = new Map(prefNew.map((x) => [x.question_id, x]))

let replaced = 0
const merged = main.map((row) => {
  const upd = prefById.get(row.question_id)
  if (upd) {
    replaced += 1
    return upd
  }
  return row
})

writeFileSync(
  `${DATA}/hypotheses.jsonl.eval-results-gpt-4o`,
  merged.map((r) => JSON.stringify(r)).join("\n") + "\n",
)
console.log(`merged: ${replaced} preference labels replaced in main eval file`)

// Score
const totals = new Map()
let correct = 0
let answered = 0
let abstained = 0
for (const row of merged) {
  const type = typeById.get(row.question_id) ?? "unknown"
  const entry = totals.get(type) ?? { correct: 0, n: 0 }
  entry.n += 1
  const label = row.autoeval_label?.label === true
  if (label) {
    entry.correct += 1
    correct += 1
  }
  totals.set(type, entry)
  const hyp = (row.hypothesis ?? "").trim().toLowerCase()
  if (hyp === "i don't know." || hyp === "i don't know") {
    abstained += 1
  } else {
    answered += 1
  }
}

console.log(`\nOverall: ${correct}/${merged.length} = ${(correct / merged.length * 100).toFixed(2)}%`)
console.log(`Answered: ${answered}  Abstained: ${abstained}`)
console.log(`\nPer-category:`)
const sorted = [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))
for (const [type, { correct, n }] of sorted) {
  console.log(`  ${type.padEnd(30)} ${correct}/${n} = ${(correct / n * 100).toFixed(2)}%`)
}
