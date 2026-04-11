#!/usr/bin/env node
// Extract the 30 single-session-preference questions into temp files for judging.
import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(__dirname, "..", "data")

const dataset = JSON.parse(readFileSync(`${DATA}/longmemeval_oracle.json`, "utf8"))
const hypotheses = readFileSync(`${DATA}/hypotheses.jsonl`, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l))

const prefInstances = dataset.filter((x) => x.question_type === "single-session-preference")
const prefIds = new Set(prefInstances.map((x) => x.question_id))
console.log(`preference instances in dataset: ${prefInstances.length}`)

const prefHypos = hypotheses.filter((h) => prefIds.has(h.question_id))
console.log(`preference hypotheses matched: ${prefHypos.length}`)

writeFileSync(
  `${DATA}/preference-oracle.json`,
  JSON.stringify(prefInstances, null, 2),
)
writeFileSync(
  `${DATA}/preference-hypotheses.jsonl`,
  prefHypos.map((h) => JSON.stringify(h)).join("\n") + "\n",
)
console.log("wrote:")
console.log(`  ${DATA}/preference-oracle.json`)
console.log(`  ${DATA}/preference-hypotheses.jsonl`)
