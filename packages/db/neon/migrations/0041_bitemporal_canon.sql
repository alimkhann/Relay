-- Memory Architecture v2 — bi-temporal + lifecycle_state on memory_items.
-- Adds valid_from, valid_until, expired_at, lifecycle_state. Installs a trigger
-- that keeps lifecycle_state and is_archived in sync (lifecycle_state is the
-- source of truth; is_archived is kept populated for back-compat). Scope stays
-- project_id (NOT NULL); the spaces layer is dropped.

alter table memory_items
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists lifecycle_state text;

-- Default + check constraint installed after the column exists so we can
-- backfill without violating the NOT NULL or CHECK ordering.
update memory_items
set lifecycle_state = case when is_archived then 'archived' else 'active' end
where lifecycle_state is null;

alter table memory_items
  alter column lifecycle_state set default 'active',
  alter column lifecycle_state set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'memory_items'::regclass
      and conname  = 'memory_items_lifecycle_state_check'
  ) then
    alter table memory_items
      add constraint memory_items_lifecycle_state_check
      check (lifecycle_state in ('active','cooling','archived','forgotten'));
  end if;
end$$;

-- Backfill valid_from from captured_at, falling back to created_at when
-- captured_at is NULL (recon confirmed captured_at is_nullable=YES).
update memory_items
set valid_from = coalesce(captured_at, created_at)
where valid_from is null;

-- Sync trigger: lifecycle_state is the source of truth; mirror it to
-- is_archived so legacy readers (dashboard, MCP) don't see drift.
create or replace function public.memory_items_lifecycle_sync()
returns trigger
language plpgsql
as $$
begin
  -- Treat new.is_archived as a transitional input only when lifecycle_state
  -- was not explicitly set by the caller. Easy heuristic: if both fields
  -- changed but lifecycle_state stayed in 'active' while is_archived flipped
  -- to true, follow the legacy field this one time.
  if tg_op = 'UPDATE'
     and new.lifecycle_state = old.lifecycle_state
     and new.is_archived is distinct from old.is_archived then
    if new.is_archived then
      new.lifecycle_state := 'archived';
    else
      if new.lifecycle_state in ('archived','forgotten') then
        new.lifecycle_state := 'active';
      end if;
    end if;
  end if;

  -- Authoritative direction: lifecycle_state -> is_archived.
  new.is_archived := new.lifecycle_state in ('archived','forgotten');
  return new;
end;
$$;

drop trigger if exists trg_memory_items_lifecycle_sync on memory_items;
create trigger trg_memory_items_lifecycle_sync
before insert or update on memory_items
for each row
execute function public.memory_items_lifecycle_sync();

create index if not exists idx_memory_items_project_valid_until
  on memory_items (project_id, valid_until);

create index if not exists idx_memory_items_project_lifecycle
  on memory_items (project_id, lifecycle_state);

create index if not exists idx_memory_items_project_lifecycle_reaffirmed
  on memory_items (project_id, lifecycle_state, last_reaffirmed_at);

-- DOWN
-- drop trigger if exists trg_memory_items_lifecycle_sync on memory_items;
-- drop function if exists public.memory_items_lifecycle_sync();
-- alter table memory_items
--   drop constraint if exists memory_items_lifecycle_state_check,
--   drop column if exists lifecycle_state,
--   drop column if exists expired_at,
--   drop column if exists valid_until,
--   drop column if exists valid_from;
