-- User activation milestones: tracks the first time a user hits each
-- first-value funnel event so server-side analytics firing stays idempotent
-- across deploys, retries, and backfills.

create table if not exists user_milestones (
  user_id text not null references profiles(id) on delete cascade,
  event_name text not null,
  first_at timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb,
  primary key (user_id, event_name)
);

create index if not exists user_milestones_event_idx
  on user_milestones (event_name, first_at desc);
