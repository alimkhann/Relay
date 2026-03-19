alter table extension_api_tokens
  add column if not exists purpose text not null default 'manual';

update extension_api_tokens
set purpose = 'manual'
where purpose is null;

create index if not exists idx_extension_api_tokens_user_purpose_created_at
  on extension_api_tokens(user_id, purpose, created_at desc);
