-- Enable pgvector extension for semantic search
create extension if not exists vector;

-- Add embedding columns to memory_items
alter table memory_items
  add column if not exists embedding vector(768),
  add column if not exists embedding_model text;

-- Create HNSW index for fast cosine similarity search
create index if not exists idx_memory_items_embedding
  on memory_items using hnsw (embedding vector_cosine_ops);

-- Memory relations table
create table if not exists memory_relations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references memory_items(id) on delete cascade,
  target_id uuid not null references memory_items(id) on delete cascade,
  relation_type text not null check (relation_type in ('supersedes', 'extends', 'derives')),
  confidence real not null default 1.0,
  created_at timestamptz not null default now(),
  unique(source_id, target_id, relation_type)
);

-- Index for fast relation lookups
create index if not exists idx_memory_relations_source on memory_relations(source_id);
create index if not exists idx_memory_relations_target on memory_relations(target_id);

-- RLS for memory_relations: accessible if user can see the source memory item's project
alter table memory_relations enable row level security;

create policy memory_relations_viewer_policy on memory_relations
  for all
  using (
    exists (
      select 1 from memory_items mi
      join project_members pm on pm.project_id = mi.project_id
      where mi.id = memory_relations.source_id
        and pm.user_id = current_setting('relay.current_user_id', true)
    )
  );
