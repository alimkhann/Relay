/**
 * Batch migration script to encrypt existing plaintext data.
 *
 * Idempotent: skips rows where content already starts with "enc::".
 * Run with: npx tsx packages/db/src/scripts/encrypt-existing-data.ts
 *
 * Requires RELAY_CONTENT_ENCRYPTION_KEY (or fallback) to be set.
 */

import { createRepositoryProvider } from "../store/provider"
import { encryptTextIfConfigured } from "../utils/encrypted-text"

const BATCH_SIZE = 100
const ENCRYPTED_PREFIX = "enc::"

function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX)
}

async function main() {
  const provider = createRepositoryProvider()

  // Verify encryption is configured
  const testEncrypted = encryptTextIfConfigured("test")
  if (!testEncrypted.startsWith(ENCRYPTED_PREFIX)) {
    console.error("RELAY_CONTENT_ENCRYPTION_KEY is not configured. Set it before running this script.")
    process.exit(1)
  }

  console.log("Starting batch encryption migration...")

  // 1. Encrypt memory_items
  console.log("\n--- memory_items ---")
  let memoryCount = 0
  let offset = 0

  while (true) {
    const rows = await provider.query(
      `SELECT id, title, content FROM memory_items
       WHERE content NOT LIKE 'enc::%'
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    )

    if (rows.length === 0) break

    for (const row of rows) {
      const r = row as Record<string, unknown>
      const plaintext = String(r.content)
      const encrypted = encryptTextIfConfigured(plaintext)

      await provider.query(
        `UPDATE memory_items
         SET content = $2,
             search_vector = to_tsvector('english', coalesce($3, '') || ' ' || $4)
         WHERE id = $1`,
        [r.id, encrypted, r.title ?? "", plaintext]
      )
      memoryCount++
    }

    console.log(`  Encrypted ${memoryCount} memory items so far...`)
    offset += BATCH_SIZE
  }

  console.log(`  Done: ${memoryCount} memory items encrypted.`)

  // 2. Encrypt source_turns
  console.log("\n--- source_turns ---")
  let turnCount = 0
  offset = 0

  while (true) {
    const rows = await provider.query(
      `SELECT id, content, raw_html FROM source_turns
       WHERE content NOT LIKE 'enc::%'
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    )

    if (rows.length === 0) break

    for (const row of rows) {
      const r = row as Record<string, unknown>
      const encryptedContent = encryptTextIfConfigured(String(r.content))
      const encryptedRawHtml = r.raw_html ? encryptTextIfConfigured(String(r.raw_html)) : null

      await provider.query(
        `UPDATE source_turns SET content = $2, raw_html = $3 WHERE id = $1`,
        [r.id, encryptedContent, encryptedRawHtml]
      )
      turnCount++
    }

    console.log(`  Encrypted ${turnCount} source turns so far...`)
    offset += BATCH_SIZE
  }

  console.log(`  Done: ${turnCount} source turns encrypted.`)

  // 3. Encrypt project_state
  console.log("\n--- project_state ---")
  const stateRows = await provider.query(
    `SELECT project_id, project_overview, current_objective, stack_domain,
            recent_progress, decisions, constraints, open_tasks, relevant_tools,
            objective_history
     FROM project_state`,
    []
  )

  let stateCount = 0
  for (const row of stateRows) {
    const r = row as Record<string, unknown>
    const overview = r.project_overview ? String(r.project_overview) : null
    const objective = r.current_objective ? String(r.current_objective) : null
    const stack = r.stack_domain ? String(r.stack_domain) : null
    const progress = r.recent_progress ? String(r.recent_progress) : null

    // Skip if already encrypted (check text fields)
    if (overview && isEncrypted(overview)) continue

    await provider.query(
      `UPDATE project_state
       SET project_overview = $2,
           current_objective = $3,
           stack_domain = $4,
           recent_progress = $5,
           decisions = $6::jsonb,
           constraints = $7::jsonb,
           open_tasks = $8::jsonb,
           relevant_tools = $9::jsonb,
           objective_history = $10::jsonb
       WHERE project_id = $1`,
      [
        r.project_id,
        overview ? encryptTextIfConfigured(overview) : null,
        objective ? encryptTextIfConfigured(objective) : null,
        stack ? encryptTextIfConfigured(stack) : null,
        progress ? encryptTextIfConfigured(progress) : null,
        encryptTextIfConfigured(JSON.stringify(r.decisions ?? [])),
        encryptTextIfConfigured(JSON.stringify(r.constraints ?? [])),
        encryptTextIfConfigured(JSON.stringify(r.open_tasks ?? [])),
        encryptTextIfConfigured(JSON.stringify(r.relevant_tools ?? [])),
        encryptTextIfConfigured(JSON.stringify(r.objective_history ?? [])),
      ]
    )
    stateCount++
  }

  console.log(`  Done: ${stateCount} project states encrypted.`)

  // 4. Encrypt session_digests
  console.log("\n--- session_digests ---")
  let digestCount = 0
  offset = 0

  while (true) {
    const rows = await provider.query(
      `SELECT id, summary_short, structured_digest FROM session_digests
       WHERE summary_short NOT LIKE 'enc::%'
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    )

    if (rows.length === 0) break

    for (const row of rows) {
      const r = row as Record<string, unknown>

      await provider.query(
        `UPDATE session_digests
         SET summary_short = $2,
             structured_digest = $3::jsonb
         WHERE id = $1`,
        [
          r.id,
          encryptTextIfConfigured(String(r.summary_short)),
          encryptTextIfConfigured(JSON.stringify(r.structured_digest ?? {})),
        ]
      )
      digestCount++
    }

    console.log(`  Encrypted ${digestCount} session digests so far...`)
    offset += BATCH_SIZE
  }

  console.log(`  Done: ${digestCount} session digests encrypted.`)

  console.log("\nMigration complete!")
  process.exit(0)
}

main().catch((error) => {
  console.error("Migration failed:", error)
  process.exit(1)
})
