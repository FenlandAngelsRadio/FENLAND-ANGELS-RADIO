-- FAR Cloud Live DJ Management
-- Run once in the FAR Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.far_djs (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  stream_username text not null unique check (stream_username ~ '^[a-z0-9_]{3,40}$'),
  mount_name text not null unique check (mount_name ~ '^/dj-[a-z0-9-]{3,50}$'),
  enabled boolean not null default true,
  connection_allowed boolean not null default true,
  show_name text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.far_djs enable row level security;

drop policy if exists "FAR managers read DJs" on public.far_djs;
create policy "FAR managers read DJs" on public.far_djs for select to authenticated
using (public.far_current_staff_role() in ('owner','deputy_manager'));

drop policy if exists "FAR managers add DJs" on public.far_djs;
create policy "FAR managers add DJs" on public.far_djs for insert to authenticated
with check (public.far_current_staff_role() in ('owner','deputy_manager'));

drop policy if exists "FAR managers update DJs" on public.far_djs;
create policy "FAR managers update DJs" on public.far_djs for update to authenticated
using (public.far_current_staff_role() in ('owner','deputy_manager'))
with check (public.far_current_staff_role() in ('owner','deputy_manager'));

drop policy if exists "FAR managers delete DJs" on public.far_djs;
create policy "FAR managers delete DJs" on public.far_djs for delete to authenticated
using (public.far_current_staff_role() in ('owner','deputy_manager'));

create index if not exists far_djs_enabled_idx on public.far_djs(enabled, connection_allowed);
