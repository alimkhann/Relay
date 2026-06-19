-- Role provisioning for the RLS swap (F3). See docs/memory-v2/F3-rls-audit.md.
--
-- This file is NOT a tracked migration (relay_schema_migrations) — Postgres
-- roles are global objects, not schema, and their passwords are environment-
-- specific. Apply manually per Neon branch via the Neon SQL editor or via
-- mcp__Neon__run_sql with the passwords substituted.
--
-- The three roles (all created here, idempotent — safe to re-run):
--
--   | Role          | bypassrls | Used by                              | Env var              |
--   |---------------|-----------|--------------------------------------|----------------------|
--   | relay_app     | false     | Web app, user-scoped reads/writes    | DATABASE_URL         |
--   | relay_worker  | true*     | Cron: pipeline, backfill, hygiene    | WORKER_DATABASE_URL  |
--   | relay_service | true*     | Pre-auth, webhooks, account deletion | SERVICE_DATABASE_URL |
--
--   * bypassrls cannot be self-granted via SQL on Neon (requires SUPERUSER).
--     Grant it from the Neon console → Roles → role → "Bypass RLS" AFTER running
--     this block. relay_app must STAY non-bypass — that is the whole point of
--     the swap (its queries are filtered by the per-request relay.current_user_id
--     GUC set in packages/db/src/store/provider.ts).
--
-- Usage:
--   1. Replace :app_password / :worker_password / :service_password with strong
--      generated secrets (do NOT commit them).
--   2. Run the block end-to-end.
--   3. In the Neon console, enable "Bypass RLS" on relay_worker + relay_service
--      ONLY (never relay_app).
--   4. Set the env vars to the matching connection strings:
--        DATABASE_URL=postgresql://relay_app:<pw>@<host>/<db>?sslmode=require
--        WORKER_DATABASE_URL=postgresql://relay_worker:<pw>@<host>/<db>?sslmode=require
--        SERVICE_DATABASE_URL=postgresql://relay_service:<pw>@<host>/<db>?sslmode=require
--      (WORKER_/SERVICE_ unset → providers fall back to DATABASE_URL, no-op.)
--   5. Redeploy so the new connections are picked up.
--
-- FORCE ROW LEVEL SECURITY is intentionally NOT enabled: relay_app is a
-- non-owner so RLS already binds for it, and FORCE would also block the owner
-- (migrations / maintenance). The RLS enforcement test
-- (packages/db/src/store/rls-enforcement.test.ts) is the guard that policies
-- actually bind for a non-owner role.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'relay_app') then
    execute format('create role relay_app login password %L noinherit', :'app_password');
  end if;
  if not exists (select 1 from pg_roles where rolname = 'relay_worker') then
    execute format('create role relay_worker login password %L noinherit', :'worker_password');
  end if;
  if not exists (select 1 from pg_roles where rolname = 'relay_service') then
    execute format('create role relay_service login password %L noinherit', :'service_password');
  end if;
end $$;

-- Grants are identical across the three roles. RLS (not GRANTs) is what scopes
-- relay_app per-tenant; relay_worker/relay_service additionally bypass RLS.
-- EXECUTE on all functions is required so the SECURITY DEFINER helpers used by
-- policies (public.is_project_member, public.current_relay_user_id,
-- public.session_project_id — see 0001_initial.sql) are callable by relay_app.
do $$
declare
  r text;
begin
  foreach r in array array['relay_app', 'relay_worker', 'relay_service']
  loop
    execute format('grant connect on database neondb to %I', r);
    execute format('grant usage on schema public to %I', r);
    execute format('grant select, insert, update, delete on all tables in schema public to %I', r);
    execute format('grant usage, select on all sequences in schema public to %I', r);
    execute format('grant execute on all functions in schema public to %I', r);
    execute format('alter default privileges in schema public grant select, insert, update, delete on tables to %I', r);
    execute format('alter default privileges in schema public grant usage, select on sequences to %I', r);
    execute format('alter default privileges in schema public grant execute on functions to %I', r);
  end loop;
end $$;

-- neon_auth schema grants. Google sign-in (google-auth-service.ts) provisions
-- identity rows directly into the Neon-Auth-managed better-auth tables
-- (neon_auth."user" / neon_auth.account / neon_auth.session) via the service
-- role when the Neon Auth SDK social path is unavailable, and account deletion
-- removes them. The schema is owned by the `neon_auth` role, so the public-only
-- grants above do NOT cover it — without this block the relay_* roles hit
-- "permission denied for schema neon_auth" and the extension/web Google login
-- 500s. Issued as a member of `neon_auth` (e.g. neondb_owner). Re-run if a Neon
-- Auth re-provision resets these grants.
do $$
declare
  r text;
begin
  foreach r in array array['relay_app', 'relay_worker', 'relay_service']
  loop
    execute format('grant usage on schema neon_auth to %I', r);
    execute format('grant select, insert, update, delete on all tables in schema neon_auth to %I', r);
    execute format('grant usage, select on all sequences in schema neon_auth to %I', r);
    execute format('alter default privileges for role neon_auth in schema neon_auth grant select, insert, update, delete on tables to %I', r);
    execute format('alter default privileges for role neon_auth in schema neon_auth grant usage, select on sequences to %I', r);
  end loop;
end $$;

-- Then, in the Neon console (cannot be done from SQL here):
--   relay_worker  → enable Bypass RLS
--   relay_service → enable Bypass RLS
--   relay_app     → leave Bypass RLS OFF
