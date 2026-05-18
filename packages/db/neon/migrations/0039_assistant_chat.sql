create table if not exists assistant_chats (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null default 'New chat',
  surface text not null default 'dashboard' check (surface in ('dashboard', 'docs', 'settings', 'extension')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references assistant_chats(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  parent_id uuid references assistant_messages(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text not null default '',
  tool_name text,
  tool_payload jsonb not null default '{}'::jsonb,
  feedback text check (feedback in ('like', 'dislike')),
  token_input integer not null default 0,
  token_output integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists assistant_attachments (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references assistant_chats(id) on delete cascade,
  user_id text not null references profiles(id) on delete cascade,
  file_name text not null,
  mime text not null,
  byte_size bigint not null default 0,
  storage_key text not null,
  extracted_text text,
  saved_to_relay boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_chats_user_updated
  on assistant_chats(user_id, updated_at desc);
create index if not exists idx_assistant_messages_chat_created
  on assistant_messages(chat_id, created_at);
create index if not exists idx_assistant_messages_parent
  on assistant_messages(parent_id);
create index if not exists idx_assistant_attachments_chat
  on assistant_attachments(chat_id, created_at desc);

alter table assistant_chats enable row level security;
alter table assistant_messages enable row level security;
alter table assistant_attachments enable row level security;

create policy "Users manage own assistant chats"
on assistant_chats
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own assistant messages"
on assistant_messages
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());

create policy "Users manage own assistant attachments"
on assistant_attachments
for all
using (user_id = public.current_relay_user_id())
with check (user_id = public.current_relay_user_id());
