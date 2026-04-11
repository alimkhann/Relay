import { readFileSync, existsSync, appendFileSync, readFile } from "node:fs"
import { readFile as readFileAsync } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import OpenAI from "openai"
import { Pool } from "pg"

import type { DatabaseProvider } from "@relay/db"

import { CostTracker } from "./src/cost"
import { Embedder } from "./src/embed"
import { ingestInstance } from "./src/ingest"
import { retrieve } from "./src/retrieve"
import { answerQuestion } from "./src/answer"
import type { LongMemEvalInstance } from "./src/types"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

loadEnv(resolve(__dirname, ".env"))

const DATASET_PATH = resolve(__dirname, "data/longmemeval_oracle.json")
const HYPOTHESES_PATH = resolve(__dirname, "data/hypotheses.jsonl")

const CONFIG = {
  databaseUrl: required("DATABASE_URL"),
  userId: required("RELAY_TEST_USER_ID"),
  openaiKey: process.env.OPENAI_API_KEY ?? "",
  answerModel: process.env.ANSWER_MODEL ?? "gpt-4o-mini",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  maxSpendUsd: Number(process.env.MAX_SPEND_USD ?? "1.50"),
  limitQuestions: process.env.LIMIT_QUESTIONS
    ? Number(process.env.LIMIT_QUESTIONS)
    : undefined,
  dryRun: process.env.DRY_RUN === "1",
  topK: Number(process.env.TOP_K ?? "20"),
}

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`missing env: ${key}`)
  return value
}

function loadEnv(path: string) {
  if (!existsSync(path)) return
  const content = readFileSync(path, "utf8")
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    if (process.env[key] !== undefined) continue
    process.env[key] = match[2].trim().replace(/^["']|["']$/g, "")
  }
}

async function loadDataset(): Promise<LongMemEvalInstance[]> {
  if (!existsSync(DATASET_PATH)) {
    throw new Error(
      `dataset not found at ${DATASET_PATH}\n` +
        `download via: curl -L -o data/longmemeval_oracle.json https://huggingface.co/datasets/xiaowu0162/longmemeval/resolve/main/longmemeval_oracle.json`,
    )
  }
  const raw = await readFileAsync(DATASET_PATH, "utf8")
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : parsed.instances ?? []
}

function loadExistingHypotheses(): Set<string> {
  if (!existsSync(HYPOTHESES_PATH)) return new Set()
  const lines = readFileSync(HYPOTHESES_PATH, "utf8").split("\n").filter(Boolean)
  return new Set(
    lines
      .map((line) => {
        try {
          return JSON.parse(line).question_id as string
        } catch {
          return ""
        }
      })
      .filter(Boolean),
  )
}

function appendHypothesis(questionId: string, hypothesis: string) {
  appendFileSync(
    HYPOTHESES_PATH,
    JSON.stringify({ question_id: questionId, hypothesis }) + "\n",
  )
}

/**
 * Build a scoped DatabaseProvider bound to a single postgres client + viewer id.
 * This mirrors what @relay/db's createRepositoryProvider does, but against the
 * raw `pg` Pool so we don't drag in Neon serverless for local benchmark runs.
 */
function makeProviderFactory(pool: Pool, userId: string) {
  return async function withProvider<T>(
    fn: (provider: DatabaseProvider) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect()
    try {
      await client.query("begin")
      await client.query(
        "select set_config('relay.current_user_id', $1, true)",
        [userId],
      )
      const provider: DatabaseProvider = {
        mode: "local",
        async query(text, values = []) {
          const result = await client.query(text, values)
          return result.rows as never
        },
        async transaction(cb) {
          return cb(provider)
        },
      }
      const result = await fn(provider)
      await client.query("commit")
      return result
    } catch (err) {
      await client.query("rollback")
      throw err
    } finally {
      client.release()
    }
  }
}

async function createProject(
  pool: Pool,
  userId: string,
  name: string,
): Promise<string> {
  const id = randomUUID()
  const slug = `longmemeval-${id.slice(0, 8)}`
  await pool.query(
    `insert into projects (id, owner_id, name, slug) values ($1, $2, $3, $4)`,
    [id, userId, name, slug],
  )
  await pool.query(
    `insert into project_members (project_id, user_id, role) values ($1, $2, 'owner')`,
    [id, userId],
  )
  return id
}

async function dropProject(pool: Pool, projectId: string) {
  await pool.query(`delete from projects where id = $1`, [projectId])
}

async function main() {
  const dataset = await loadDataset()
  const existing = loadExistingHypotheses()
  const pool = new Pool({ connectionString: CONFIG.databaseUrl, max: 4 })
  const withProvider = makeProviderFactory(pool, CONFIG.userId)

  const cost = new CostTracker(CONFIG.maxSpendUsd)
  const openai = new OpenAI({ apiKey: CONFIG.openaiKey || "sk-dry-run" })
  const embedder = new Embedder(
    openai,
    CONFIG.embeddingModel,
    cost,
    CONFIG.dryRun,
  )

  const typeFilter = process.env.FILTER_QUESTION_TYPE
  let work = typeFilter
    ? dataset.filter((x) => x.question_type === typeFilter)
    : dataset
  if (CONFIG.limitQuestions) work = work.slice(0, CONFIG.limitQuestions)
  console.log(
    `[harness] ${work.length} instances (skipping ${existing.size} already done) | dryRun=${CONFIG.dryRun} | answer=${CONFIG.answerModel} | cap=$${CONFIG.maxSpendUsd}`,
  )

  let done = 0
  const started = Date.now()

  for (const instance of work) {
    if (existing.has(instance.question_id)) {
      done += 1
      continue
    }

    const label = `${done + 1}/${work.length} ${instance.question_id} [${instance.question_type}]`
    const projectId = await createProject(
      pool,
      CONFIG.userId,
      `longmemeval ${instance.question_id}`,
    )

    try {
      let hypothesis = ""
      await withProvider(async (provider) => {
        const { items } = await ingestInstance({
          provider,
          userId: CONFIG.userId,
          projectId,
          instance,
          embedder,
        })
        const chunks = await retrieve({
          provider,
          projectId,
          query: instance.question,
          embedder,
          topK: CONFIG.topK,
        })
        if (process.env.DEBUG_RETRIEVE === "1") {
          const count = await provider.query(
            "select count(*)::int as c from memory_items where project_id = $1",
            [projectId],
          )
          const lex = await provider.query(
            `select id, content, ts_rank(search_vector, plainto_tsquery('english', $2)) as rank
             from memory_items where project_id = $1 and search_vector @@ plainto_tsquery('english', $2)
             order by rank desc limit 5`,
            [projectId, instance.question],
          )
          console.log(`[debug] total=${(count[0] as any).c} lex_hits=${lex.length}`)
          for (const r of lex) console.log(`  lex rank=${(r as any).rank} ${String((r as any).content).slice(0, 80)}`)
        }
        hypothesis = await answerQuestion({
          client: openai,
          model: CONFIG.answerModel,
          cost,
          question: instance.question,
          questionDate: instance.question_date,
          chunks,
          dryRun: CONFIG.dryRun,
        })
        const preview = hypothesis.slice(0, 80).replace(/\n/g, " ")
        console.log(
          `[${label}] items=${items} top=${chunks.length} spend=$${cost.summary().totalUsd.toFixed(4)} ${preview}`,
        )
      })
      appendHypothesis(instance.question_id, hypothesis)
    } finally {
      if (process.env.KEEP_PROJECTS !== "1") {
        await dropProject(pool, projectId)
      } else {
        console.log(`[debug] kept projectId=${projectId}`)
      }
    }

    done += 1
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `[harness] done ${done}/${work.length} in ${elapsed}s | cost=${JSON.stringify(cost.summary())}`,
  )
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
