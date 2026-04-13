import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { execSync } from "node:child_process"

import { Pool } from "pg"

export interface BenchmarkConfig {
  databaseUrl: string
  userId: string
  openaiKey: string
  dryRun: boolean
}

export interface BenchmarkPreflightResult {
  executionMode: "local-source"
  gitSha: string | null
  latestMigrationFile: string | null
  latestAppliedMigrationFile: string | null
  migrationsCurrent: boolean
  datasetPresent: boolean
  benchmarkEnvValid: boolean
  userPresent: boolean
  checkedAt: string
}

export function getLatestMigrationFile(migrationsDir: string): string | null {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
  return files.at(-1) ?? null
}

function safeGitSha(repoRoot: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

export async function runBenchmarkPreflight(input: {
  repoRoot: string
  benchmarkRoot: string
  config: BenchmarkConfig
  datasetPath: string
}): Promise<BenchmarkPreflightResult> {
  const migrationsDir = resolve(input.repoRoot, "packages/db/neon/migrations")
  const latestMigrationFile = getLatestMigrationFile(migrationsDir)
  const gitSha = safeGitSha(input.repoRoot)
  const datasetPresent = existsSync(input.datasetPath)
  const benchmarkEnvValid = input.config.dryRun || Boolean(input.config.openaiKey)

  const pool = new Pool({ connectionString: input.config.databaseUrl, max: 1 })
  try {
    const [migrationRows, userRows] = await Promise.all([
      pool.query(
        "select file_name from relay_schema_migrations order by file_name desc limit 1",
      ),
      pool.query("select id from profiles where id = $1 limit 1", [input.config.userId]),
    ])

    const latestAppliedMigrationFile = migrationRows.rows[0]?.file_name ?? null
    const result: BenchmarkPreflightResult = {
      executionMode: "local-source",
      gitSha,
      latestMigrationFile,
      latestAppliedMigrationFile,
      migrationsCurrent: latestMigrationFile === latestAppliedMigrationFile,
      datasetPresent,
      benchmarkEnvValid,
      userPresent: (userRows.rowCount ?? 0) > 0,
      checkedAt: new Date().toISOString(),
    }

    if (!result.datasetPresent) {
      throw new Error(`Dataset missing at ${input.datasetPath}`)
    }
    if (!result.benchmarkEnvValid) {
      throw new Error("OPENAI_API_KEY is required unless DRY_RUN=1")
    }
    if (!result.userPresent) {
      throw new Error(`Benchmark user ${input.config.userId} does not exist in profiles`) 
    }
    if (!result.migrationsCurrent) {
      throw new Error(
        `Database is not current. Latest migration is ${latestMigrationFile ?? "unknown"} but applied is ${latestAppliedMigrationFile ?? "none"}. Run pnpm db:local:migrate or the equivalent target migration command first.`,
      )
    }

    const outputDir = resolve(input.benchmarkRoot, "results")
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(
      resolve(outputDir, "last-preflight.json"),
      JSON.stringify(result, null, 2),
      "utf8",
    )

    return result
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmarkRoot = resolve(process.cwd())
  const repoRoot = resolve(benchmarkRoot, "../..")
  const databaseUrl = process.env.DATABASE_URL
  const userId = process.env.RELAY_TEST_USER_ID
  const openaiKey = process.env.OPENAI_API_KEY ?? ""
  const dryRun = process.env.DRY_RUN === "1"

  if (!databaseUrl || !userId) {
    console.error("DATABASE_URL and RELAY_TEST_USER_ID are required for preflight.")
    process.exit(1)
  }

  runBenchmarkPreflight({
    repoRoot,
    benchmarkRoot,
    config: { databaseUrl, userId, openaiKey, dryRun },
    datasetPath: resolve(benchmarkRoot, "data/longmemeval_oracle.json"),
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
