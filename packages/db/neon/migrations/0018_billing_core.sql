create table if not exists billing_customers (
  user_id text primary key references profiles(id) on delete cascade,
  provider text not null default 'polar',
  provider_customer_id text unique,
  external_customer_id text not null unique,
  email text,
  name text,
  trial_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  provider text not null default 'polar',
  provider_subscription_id text not null unique,
  provider_customer_id text,
  product_id text,
  plan_key text not null,
  status text not null,
  interval text,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_status
  on subscriptions(user_id, status, updated_at desc);

create table if not exists entitlements (
  user_id text primary key references profiles(id) on delete cascade,
  plan_key text not null default 'free',
  status text not null default 'inactive',
  provider_customer_id text,
  provider_subscription_id text,
  interval text,
  active_projects_limit integer not null,
  history_retention_days integer not null,
  capture_limit_monthly integer not null,
  mcp_read_limit_daily integer not null,
  mcp_write_limit_daily integer not null,
  handoff_enabled boolean not null default false,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists usage_counters (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null,
  feature_key text not null,
  window_key text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(scope_key, feature_key, window_key, window_start)
);

create index if not exists idx_usage_counters_scope_feature
  on usage_counters(scope_key, feature_key, window_start desc);

create table if not exists billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'polar',
  provider_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table billing_customers enable row level security;
alter table subscriptions enable row level security;
alter table entitlements enable row level security;
alter table usage_counters enable row level security;
alter table billing_webhook_events enable row level security;

create policy "Users manage own billing customer"
on billing_customers
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own subscriptions"
on subscriptions
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own entitlements"
on entitlements
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own usage counters"
on usage_counters
for all
using (scope_key = ('user:' || public.current_relay_user_id()))
with check (scope_key = ('user:' || public.current_relay_user_id()));

create policy "Users cannot directly manage billing webhook events"
on billing_webhook_events
for all
using (false)
with check (false);
