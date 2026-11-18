create table if not exists public.panel_mirror_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  source_panel_id uuid references public.panels(id) on delete set null,
  target_panel_id uuid references public.panels(id) on delete set null,
  allow_delete boolean not null default false,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_status text,
  last_result jsonb,
  updated_at timestamptz not null default now()
);

alter table public.panel_mirror_settings enable row level security;
insert into public.panel_mirror_settings (id) values (true) on conflict (id) do nothing;
