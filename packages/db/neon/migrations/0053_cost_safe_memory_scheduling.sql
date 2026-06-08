-- Phase 3: event-triggered memory-v2 scheduling.
-- Durable jobs replace fixed GitHub Actions wakeups; project hygiene runs only
-- for due projects from the existing daily internal cron or manual operator runs.

create table if not exists memory_pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('enrich_memory_item', 'regenerate_personal_state')),
  dedupe_key text not null,
  user_id text references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  memory_item_id uuid references memory_items(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_memory_pipeline_jobs_dedupe_active
  on memory_pipeline_jobs (dedupe_key)
  where status in ('pending', 'running', 'failed');

create index if not exists idx_memory_pipeline_jobs_pickup
  on memory_pipeline_jobs (status, run_after, created_at)
  where status in ('pending', 'failed');

create index if not exists idx_memory_pipeline_jobs_memory_item
  on memory_pipeline_jobs (memory_item_id)
  where memory_item_id is not null;

alter table projects
  add column if not exists next_hygiene_at timestamptz,
  add column if not exists last_hygiene_at timestamptz;

-- Stagger existing projects across one week. The daily recovery cron remains
-- bounded, so this seeds coverage without creating one large immediate sweep.
update projects
set next_hygiene_at = now() + (mod(abs(hashtext(id::text)::bigint), 7) * interval '1 day')
where next_hygiene_at is null
  and is_archived = false;

create index if not exists idx_projects_due_hygiene
  on projects (next_hygiene_at asc)
  where next_hygiene_at is not null and is_archived = false;
