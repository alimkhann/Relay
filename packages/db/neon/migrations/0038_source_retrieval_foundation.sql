create table if not exists global_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('documentation', 'repository', 'llms_txt', 'openapi', 'package')),
  canonical_url text not null,
  display_name text not null,
  trust_score real not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, canonical_url)
);

create table if not exists project_global_source_links (
  project_id uuid not null references projects(id) on delete cascade,
  global_source_id uuid not null references global_sources(id) on delete cascade,
  project_source_id uuid references project_sources(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (project_id, global_source_id)
);

create table if not exists source_index_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references project_sources(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed')),
  kind text not null check (kind in ('index', 'refresh', 'import')),
  progress real not null default 0,
  pages_total integer not null default 0,
  pages_indexed integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists source_pages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references project_sources(id) on delete cascade,
  version_id uuid not null references source_versions(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  url text not null,
  canonical_url text,
  title text,
  heading_path text[] not null default '{}',
  content text not null,
  content_hash text not null,
  content_type text,
  etag text,
  last_modified text,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, url)
);

create table if not exists source_external_citations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_id uuid not null references project_sources(id) on delete cascade,
  version_id uuid not null references source_versions(id) on delete cascade,
  chunk_id uuid references source_chunks(id) on delete set null,
  provider text not null check (provider in ('context7', 'nia', 'external')),
  provider_source_id text,
  title text not null,
  url text not null,
  content_hash text not null,
  locator jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_global_sources_type_url
  on global_sources(source_type, canonical_url);
create index if not exists idx_project_global_source_links_project
  on project_global_source_links(project_id, created_at desc);
create index if not exists idx_source_index_jobs_source_updated
  on source_index_jobs(source_id, updated_at desc);
create index if not exists idx_source_pages_source_url
  on source_pages(source_id, url);
create index if not exists idx_source_pages_search
  on source_pages using gin(search_vector);
create index if not exists idx_source_external_citations_source
  on source_external_citations(source_id, created_at desc);

alter table global_sources enable row level security;
alter table project_global_source_links enable row level security;
alter table source_index_jobs enable row level security;
alter table source_pages enable row level security;
alter table source_external_citations enable row level security;

create policy "Authenticated users can read global sources"
on global_sources
for select
using (auth.uid() is not null);

create policy "Members manage project global source links"
on project_global_source_links
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage source index jobs"
on source_index_jobs
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage source pages"
on source_pages
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "Members manage source external citations"
on source_external_citations
for all
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));
