-- Raw delivery audit log for Polar webhooks.
-- Recorded BEFORE signature validation so we have a durable trail even when
-- `validateEvent()` throws. Independent of `billing_webhook_events` (which
-- only holds successfully-verified events).

create table if not exists billing_webhook_raw_deliveries (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'polar',
  polar_event_id text,
  polar_event_type text,
  headers jsonb not null default '{}'::jsonb,
  body_hash text,
  body_length integer,
  status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_webhook_raw_deliveries_received_at
  on billing_webhook_raw_deliveries (received_at desc);

create index if not exists idx_billing_webhook_raw_deliveries_status
  on billing_webhook_raw_deliveries (status, received_at desc);

create index if not exists idx_billing_webhook_raw_deliveries_polar_event_id
  on billing_webhook_raw_deliveries (polar_event_id)
  where polar_event_id is not null;

alter table billing_webhook_raw_deliveries enable row level security;

create policy "Users cannot directly manage billing webhook raw deliveries"
on billing_webhook_raw_deliveries
for all
using (false)
with check (false);
