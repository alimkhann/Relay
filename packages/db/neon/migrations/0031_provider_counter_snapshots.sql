create table if not exists provider_counter_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_project_id text not null,
  snapshot_date date not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  billing_mode text,
  estimation_method text not null,
  cost_usd numeric(18, 6) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, external_project_id, snapshot_date)
);

create index if not exists idx_provider_counter_snapshots_provider_date
  on provider_counter_snapshots(provider, external_project_id, snapshot_date desc);
