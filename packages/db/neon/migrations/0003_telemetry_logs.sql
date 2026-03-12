create table telemetry_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null,
  surface text not null,
  area text not null,
  event text not null,
  message text not null,
  request_id text,
  flow_id text,
  user_id text,
  project_id text,
  session_id text,
  tab_id integer,
  url text,
  context jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now()
);

create index idx_telemetry_logs_created_at on telemetry_logs(created_at desc);
create index idx_telemetry_logs_level_created_at on telemetry_logs(level, created_at desc);
create index idx_telemetry_logs_surface_created_at on telemetry_logs(surface, created_at desc);
create index idx_telemetry_logs_event_created_at on telemetry_logs(event, created_at desc);
create index idx_telemetry_logs_request_id on telemetry_logs(request_id);
create index idx_telemetry_logs_flow_id on telemetry_logs(flow_id);
create index idx_telemetry_logs_user_id on telemetry_logs(user_id);
create index idx_telemetry_logs_project_id on telemetry_logs(project_id);
