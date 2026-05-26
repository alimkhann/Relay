-- Worker role provisioning for the memory-pipeline cron.
--
-- This file is NOT a tracked migration (relay_schema_migrations) — Postgres
-- roles are global objects, not schema, and their passwords are environment-
-- specific. Apply this manually per Neon branch via the Neon SQL editor or
-- via mcp__Neon__run_sql with the password substituted.
--
-- Usage (psql / Neon SQL editor):
--   1. Replace :worker_password with a strong generated secret (do NOT commit it).
--   2. Run the block end-to-end. Idempotent — safe to re-run.
--   3. Set WORKER_DATABASE_URL in the corresponding environment to:
--      postgresql://relay_worker:<password>@<host>/<db>?sslmode=require
--   4. Restart the Vercel deployment (or local dev) so the cron route picks
--      up WORKER_DATABASE_URL.
--
-- Scope today: the app still connects as neondb_owner. This role is created
-- so the memory-pipeline cron can run under its own credentials. A future
-- hardening PR will swap the app to a non-owner role (relay_app) and at that
-- point relay_worker will need bypassrls (or per-table policies authorizing
-- it explicitly) since hygiene sweeps write across all spaces without a
-- per-request viewer GUC.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'relay_worker') then
    execute format('create role relay_worker login password %L noinherit', :'worker_password');
  end if;
end $$;

grant connect on database neondb to relay_worker;
grant usage on schema public to relay_worker;

grant select, insert, update, delete on all tables in schema public to relay_worker;
grant usage, select on all sequences in schema public to relay_worker;
grant execute on all functions in schema public to relay_worker;

alter default privileges in schema public
  grant select, insert, update, delete on tables to relay_worker;
alter default privileges in schema public
  grant usage, select on sequences to relay_worker;
alter default privileges in schema public
  grant execute on functions to relay_worker;

-- Future hardening step (apply only when app moves to relay_app):
--   alter role relay_worker bypassrls;
-- Requires SUPERUSER on the executing role. On Neon this must be requested
-- via the console role-permissions page; CREATE ROLE through SQL cannot
-- self-grant bypassrls. Alternative: per-table policies authorizing
-- `current_user = 'relay_worker'`.
