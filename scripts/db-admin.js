const { Pool } = require(
  require("path").resolve(
    __dirname,
    "../node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless",
  ),
);
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
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

const pool = new Pool({
  connectionString: process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL,
});

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

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}...`);
    await pool.query(sql);
  }

  console.log(`Applied ${files.length} migration files.`);
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
