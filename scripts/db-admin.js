const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { Pool } = require(
  require.resolve("pg", {
    paths: [path.resolve(__dirname, "../packages/db")],
  }),
);
const dotenvPath = require("path").resolve(__dirname, "../.env.local");
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  fs.readFileSync(filePath, "utf8")
    .split("\n")
    .forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    });
}

loadEnvFile(path.resolve(__dirname, "../.env"));
loadEnvFile(dotenvPath);

const connectionString = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("LOCAL_DATABASE_URL or DATABASE_URL is required.");
}

const pool = new Pool({
  connectionString,
});
const MIGRATIONS_TABLE = "relay_schema_migrations";
const MIGRATION_ALREADY_EXISTS_ERROR_CODES = new Set([
  "42710", // duplicate_object
  "42P07", // duplicate_table / duplicate_relation
  "42723", // duplicate_function
  "42701", // duplicate_column
  "42P06", // duplicate_schema
]);

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function isPurgeConfirmed() {
  return process.argv.includes("--confirm") || process.env.RELAY_CONFIRM_PURGE === "YES";
}

async function countTables() {
  const tables = [
    "profiles",
    "projects",
    "project_members",
    "source_sessions",
    "source_turns",
    "memory_items",
    "context_packets",
    "bootstrap_packets",
    "session_digests",
    "project_state",
    "project_state_overrides",
    "ai_job_runs",
    "capture_events",
    "project_bindings",
    "user_settings",
    "user_onboarding",
    "extension_api_tokens",
    "extension_connect_grants",
    "browser_session_handoffs",
    "target_profiles",
  ];

  for (const tableName of tables) {
    const result = await pool.query(`select count(*) as c from ${tableName}`);
    console.log(`${tableName}: ${result.rows[0].c}`);
  }
}

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, "../packages/db/neon/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const client = await pool.connect();
  try {
    await client.query(`
      create table if not exists ${MIGRATIONS_TABLE} (
        file_name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedResult = await client.query(
      `select file_name from ${MIGRATIONS_TABLE}`
    );
    const appliedFiles = new Set(appliedResult.rows.map((row) => row.file_name));

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (appliedFiles.has(file)) {
        console.log(`Skipping ${file} (already applied).`);
        skippedCount += 1;
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`Applying ${file}...`);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          `insert into ${MIGRATIONS_TABLE} (file_name) values ($1) on conflict (file_name) do nothing`,
          [file]
        );
        await client.query("commit");
        appliedFiles.add(file);
        appliedCount += 1;
      } catch (error) {
        await client.query("rollback");

        if (MIGRATION_ALREADY_EXISTS_ERROR_CODES.has(error.code)) {
          console.warn(
            `Skipping ${file} (${error.code}: ${error.message}) and marking it as applied.`
          );
          await client.query(
            `insert into ${MIGRATIONS_TABLE} (file_name) values ($1) on conflict (file_name) do nothing`,
            [file]
          );
          appliedFiles.add(file);
          skippedCount += 1;
          continue;
        }

        throw error;
      }
    }

    console.log(
      `Migration run complete. Applied ${appliedCount} file(s), skipped ${skippedCount} file(s).`
    );
  } finally {
    client.release();
  }
}

async function seedLocalUser() {
  const email =
    getArgValue("--email") ||
    process.env.RELAY_LOCAL_SEED_EMAIL ||
    "local@relay.test";
  const name =
    getArgValue("--name") ||
    process.env.RELAY_LOCAL_SEED_NAME ||
    "Relay Local";

  const existing = await pool.query(
    `select id from profiles where lower(email) = lower($1) limit 1`,
    [email]
  );
  const profileId = existing.rows[0]?.id ?? randomUUID();

  await pool.query(
    `insert into profiles (id, email, display_name, avatar_url)
     values ($1, $2, $3, null)
     on conflict (id) do update
       set email = excluded.email,
           display_name = excluded.display_name,
           updated_at = now()`,
    [profileId, email, name]
  );

  console.log(`Seeded local user ${email} (${profileId}).`);
}

async function purgeUserData() {
  if (!isPurgeConfirmed()) {
    throw new Error(
      "Refusing to purge without confirmation. Re-run with --confirm or RELAY_CONFIRM_PURGE=YES."
    );
  }

  console.log("Purging all user-owned data while keeping seeded reference tables...");
  await pool.query("truncate table profiles cascade");
  const targetProfiles = await pool.query("select count(*) as c from target_profiles");
  console.log(`Done. target_profiles remaining: ${targetProfiles.rows[0].c}`);
}

async function main() {
  const action = process.argv[2];

  if (action === "count") {
    await countTables();
  } else if (action === "migrate") {
    await runMigrations();
  } else if (action === "seed-local-user") {
    await seedLocalUser();
  } else if (action === "purge" || action === "purge-users") {
    await purgeUserData();
  } else {
    console.log(
      "Usage: node scripts/db-admin.js [count|migrate|seed-local-user|purge-users|purge] [--email value] [--name value] [--confirm]"
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
