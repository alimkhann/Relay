create table if not exists referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id text not null references profiles(id) on delete cascade,
  referee_id text not null references profiles(id) on delete cascade,
  referral_code_id uuid not null references referral_codes(id) on delete restrict,
  referee_email text,
  status text not null default 'pending_signup',
  plan_key text,
  interval text,
  provider_subscription_id text,
  paid_invoice_count integer not null default 0,
  first_paid_at timestamptz,
  last_paid_period_start timestamptz,
  activated_at timestamptz,
  qualified_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(referee_id),
  constraint referrals_no_self_referral check (referrer_id <> referee_id)
);

create index if not exists idx_referrals_referrer_status
  on referrals(referrer_id, status, qualified_at desc);

create index if not exists idx_referrals_provider_subscription
  on referrals(provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  basis_points integer not null,
  value_cents integer not null,
  status text not null default 'pending',
  provider_discount_id text,
  applied_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(referral_id)
);

create index if not exists idx_referral_rewards_user_status
  on referral_rewards(user_id, status, created_at desc);

alter table referral_codes enable row level security;
alter table referrals enable row level security;
alter table referral_rewards enable row level security;

create policy "Users manage own referral codes"
on referral_codes
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users read own referral attribution"
on referrals
for select
using (
  referrer_id = public.current_relay_user_id()
  or referee_id = public.current_relay_user_id()
);

create policy "Users cannot directly mutate referrals"
on referrals
for all
using (false)
with check (false);

create policy "Users read own referral rewards"
on referral_rewards
for select
using (user_id = public.current_relay_user_id());

create policy "Users cannot directly mutate referral rewards"
on referral_rewards
for all
using (false)
with check (false);
