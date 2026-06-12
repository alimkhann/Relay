-- Integrations layer (PRD 2026-06-10): provider accounts, normalized objects,
-- raw events, extracted observations, and per-action permission grants.
-- Deliberately SEPARATE from project_sources — sources are document-like
-- knowledge; integrations model accounts, event streams, sync state, and
-- agent action tools (Telegram first, then Calendar/Gmail/GitHub).

create table if not exists integration_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  provider text not null,
  account_label text,
  external_account_id text,
  auth_type text not null,
  scopes text[] not null default '{}',
  status text not null default 'active',
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, provider, external_account_id)
);

create index if not exists idx_integration_accounts_user_provider
  on integration_accounts (user_id, provider, status);

-- Telegram pairing: which chat id belongs to which account, fast lookup on
-- inbound webhook updates (no user context yet at that point).
create index if not exists idx_integration_accounts_provider_external
  on integration_accounts (provider, external_account_id);

create table if not exists integration_objects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references integration_accounts(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  provider text not null,
  external_id text not null,
  object_type text not null,
  project_id uuid references projects(id) on delete set null,
  title text,
  source_uri text,
  occurred_at timestamptz,
  updated_external_at timestamptz,
  payload_hash text,
  visibility text not null default 'private',
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, external_id)
);

create index if not exists idx_integration_objects_user_type
  on integration_objects (user_id, object_type, occurred_at desc);

create table if not exists integration_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references integration_accounts(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  object_id uuid references integration_objects(id) on delete set null,
  provider text not null,
  event_type text not null,
  external_event_id text,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  payload_hash text,
  raw_payload jsonb,
  processing_status text not null default 'pending'
);

-- Idempotent webhook replay: provider event ids are unique per account.
create unique index if not exists idx_integration_events_external
  on integration_events (account_id, external_event_id)
  where external_event_id is not null;

create index if not exists idx_integration_events_pending
  on integration_events (processing_status, received_at)
  where processing_status = 'pending';

create table if not exists integration_observations (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references integration_objects(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  content text not null,
  observed_at timestamptz not null default now(),
  confidence real not null default 0.5,
  sensitivity text not null default 'normal',
  extraction_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_integration_observations_user_status
  on integration_observations (user_id, extraction_status, observed_at desc);

create table if not exists integration_action_grants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references integration_accounts(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  action_name text not null,
  permission_mode text not null default 'confirm',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, action_name)
);

-- One-time pairing codes for chat-native providers (Telegram MVP): the user
-- generates a code in the dashboard and pastes it into the bot to link the
-- chat to their account. Short-lived, single-use.
create table if not exists integration_pairing_codes (
  code text primary key,
  user_id text not null references profiles(id) on delete cascade,
  provider text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists idx_integration_pairing_codes_user
  on integration_pairing_codes (user_id, provider, created_at desc);

alter table integration_accounts enable row level security;
alter table integration_objects enable row level security;
alter table integration_events enable row level security;
alter table integration_observations enable row level security;
alter table integration_action_grants enable row level security;
alter table integration_pairing_codes enable row level security;

create policy "Users manage own integration accounts"
on integration_accounts
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own integration objects"
on integration_objects
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own integration events"
on integration_events
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own integration observations"
on integration_observations
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own integration action grants"
on integration_action_grants
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own integration pairing codes"
on integration_pairing_codes
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());
