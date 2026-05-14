create table if not exists project_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in ('uploaded_file', 'repo_file', 'external_docs', 'package_docs')),
  status text not null default 'pending_upload' check (status in ('pending_upload', 'processing', 'ready', 'failed', 'archived', 'stale')),
  display_name text not null,
  original_file_name text,
  mime_type text,
  byte_size bigint not null default 0,
  storage_object_key text,
  content_hash text,
  source_uri text,
  last_seen_hash text,
  stale_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references project_sources(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'pending_upload' check (status in ('pending_upload', 'processing', 'ready', 'failed')),
  storage_object_key text,
  content_hash text not null,
  byte_size bigint not null default 0,
  extracted_text_hash text,
  extracted_text_bytes bigint not null default 0,
  chunk_count integer not null default 0,
  token_estimate integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references project_sources(id) on delete cascade,
  version_id uuid not null references source_versions(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_estimate integer not null default 0,
  locator jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector,
  embedding vector(768),
  embedding_model text,
  created_at timestamptz not null default now(),
  unique(version_id, chunk_index)
);

create table if not exists source_fact_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_id uuid not null references project_sources(id) on delete cascade,
  version_id uuid not null references source_versions(id) on delete cascade,
  chunk_id uuid references source_chunks(id) on delete set null,
  memory_item_id uuid references memory_items(id) on delete set null,
  type memory_item_type not null,
  title text,
  content text not null,
  confidence real not null default 0.5,
  status text not null default 'pending' check (status in ('pending', 'promoted', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_memory_links (
  source_id uuid not null references project_sources(id) on delete cascade,
  version_id uuid not null references source_versions(id) on delete cascade,
  chunk_id uuid references source_chunks(id) on delete set null,
  memory_item_id uuid not null references memory_items(id) on delete cascade,
  relation_type text not null default 'derived',
  confidence real not null default 1.0,
  created_at timestamptz not null default now(),
  primary key (source_id, memory_item_id)
);

create index if not exists idx_project_sources_project_status_updated
  on project_sources(project_id, status, updated_at desc);
create index if not exists idx_source_versions_source_created
  on source_versions(source_id, created_at desc);
create index if not exists idx_source_chunks_source_version
  on source_chunks(source_id, version_id, chunk_index);
create index if not exists idx_source_chunks_search
  on source_chunks using gin(search_vector);
create index if not exists idx_source_chunks_embedding
  on source_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists idx_source_fact_candidates_source_status
  on source_fact_candidates(source_id, status, confidence desc);
create index if not exists idx_source_memory_links_memory
  on source_memory_links(memory_item_id);

alter table project_sources enable row level security;
alter table source_versions enable row level security;
alter table source_chunks enable row level security;
alter table source_fact_candidates enable row level security;
alter table source_memory_links enable row level security;

create policy "Members manage project sources"
on project_sources
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage source versions"
on source_versions
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage source chunks"
on source_chunks
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage source fact candidates"
on source_fact_candidates
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage source memory links"
on source_memory_links
for all
using (public.is_project_member((select project_id from project_sources where id = source_memory_links.source_id)))
with check (public.is_project_member((select project_id from project_sources where id = source_memory_links.source_id)));
