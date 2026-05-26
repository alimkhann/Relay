#!/usr/bin/env node
import { createRequire } from "node:module"

const requireFromDbPackage = createRequire(new URL("../packages/db/package.json", import.meta.url))
const { Client } = requireFromDbPackage("pg")

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL

if (!connectionString) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.")
  process.exit(1)
}

const client = new Client({ connectionString })

async function query(label, sql, values = []) {
  const result = await client.query(sql, values)
  console.log(`\n${label}`)
  console.table(result.rows)
}

try {
  await client.connect()
  await client.query("set default_transaction_read_only = on")

  await query("Wide table sizes", `
    select relname as table_name,
           pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
           pg_total_relation_size(c.oid) as total_bytes,
           greatest(c.reltuples::bigint, 0) as estimated_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and relname in (
        'source_turns',
        'source_chunks',
        'source_pages',
        'memory_items',
        'assistant_messages',
        'source_sessions',
        'project_sources'
      )
    order by total_bytes desc
  `)

  await query("Wide text columns", `
    select 'source_turns' as table_name, count(*)::int as rows,
           round(avg(octet_length(content)))::int as avg_content_bytes,
           max(octet_length(content))::int as max_content_bytes,
           round(avg(octet_length(coalesce(raw_html,''))))::int as avg_raw_html_bytes,
           max(octet_length(coalesce(raw_html,'')))::int as max_raw_html_bytes
    from source_turns
    union all
    select 'source_chunks', count(*)::int, round(avg(octet_length(content)))::int, max(octet_length(content))::int, null::int, null::int
    from source_chunks
    union all
    select 'source_pages', count(*)::int, round(avg(octet_length(content)))::int, max(octet_length(content))::int, null::int, null::int
    from source_pages
    union all
    select 'memory_items', count(*)::int, round(avg(octet_length(content)))::int, max(octet_length(content))::int, null::int, null::int
    from memory_items
  `)

  await query("Current workload markers", `
    select
      (select count(*)::int from projects where is_archived = false) as active_projects,
      (select count(*)::int from source_sessions where is_archived = false) as active_sessions,
      (select count(*)::int from memory_items where is_archived = false) as active_memory_items,
      (select count(*)::int from project_sources where status = 'processing') as processing_sources,
      (select count(*)::int from ai_job_runs where status in ('pending','timed_out','deferred')) as pending_digest_jobs
  `)

  const extension = await client.query("select exists (select 1 from pg_extension where extname = 'pg_stat_statements') as enabled")
  const pgStatStatementsEnabled = extension.rows[0]?.enabled === true
  console.log(`\npg_stat_statements_enabled: ${pgStatStatementsEnabled}`)

  if (!pgStatStatementsEnabled) {
    console.log("Enable pg_stat_statements separately before query-level diagnostics; this script will not create extensions.")
    process.exit(0)
  }

  await query("Top queries by total rows", `
    select query, calls, rows as total_rows, case when calls > 0 then rows / calls else 0 end as avg_rows_per_call
    from pg_stat_statements
    where calls > 0
    order by rows desc
    limit 10
  `)

  await query("Top queries by rows per call", `
    select query, calls, rows as total_rows, case when calls > 0 then rows / calls else 0 end as avg_rows_per_call
    from pg_stat_statements
    where calls > 0
    order by avg_rows_per_call desc
    limit 10
  `)

  await query("Top queries by call count", `
    select query, calls, rows as total_rows, case when calls > 0 then rows / calls else 0 end as avg_rows_per_call
    from pg_stat_statements
    where calls > 0
    order by calls desc
    limit 10
  `)

  await query("Top queries by execution time", `
    select query, calls, rows as total_rows, round(total_exec_time::numeric, 2) as total_exec_time_ms
    from pg_stat_statements
    where calls > 0
    order by total_exec_time desc
    limit 10
  `)
} finally {
  await client.end().catch(() => undefined)
}
