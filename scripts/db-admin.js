const { Pool } = require(
  require("path").resolve(
    __dirname,
    "../node_modules/.pnpm/@neondatabase+serverless@1.0.2/node_modules/@neondatabase/serverless",
  ),
);
const dotenvPath = require("path").resolve(__dirname, "../.env.local");
require("fs")
  .readFileSync(dotenvPath, "utf8")
  .split("\n")
  .forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const action = process.argv[2];

  if (action === "count") {
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
      "ai_job_runs",
      "capture_events",
      "project_bindings",
      "user_settings",
      "extension_api_tokens",
      "extension_connect_grants",
      "target_profiles",
    ];
    for (const t of tables) {
      const r = await pool.query(`SELECT count(*) as c FROM ${t}`);
      console.log(`${t}: ${r.rows[0].c}`);
    }
  } else if (action === "purge") {
    console.log("Purging all user data (keeping target_profiles seed)...");
    await pool.query("TRUNCATE profiles CASCADE");
    console.log("Done. All user data wiped.");
    // Verify target_profiles still exists
    const r = await pool.query("SELECT count(*) as c FROM target_profiles");
    console.log(`target_profiles remaining: ${r.rows[0].c}`);
  } else {
    console.log("Usage: node scripts/db-admin.js [count|purge]");
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
