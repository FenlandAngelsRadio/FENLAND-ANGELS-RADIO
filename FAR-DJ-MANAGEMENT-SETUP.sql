-- FAR Cloud Live DJ Management v2
create extension if not exists pgcrypto;
create table if not exists public.far_djs(
 id uuid primary key default gen_random_uuid(),display_name text not null,show_name text,stream_username text not null unique,mount_name text not null unique,
 enabled boolean not null default true,connection_allowed boolean not null default true,connected boolean not null default false,on_air boolean not null default false,last_seen_at timestamptz,notes text,
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.far_djs add column if not exists connected boolean not null default false;
alter table public.far_djs add column if not exists on_air boolean not null default false;
alter table public.far_djs add column if not exists last_seen_at timestamptz;
alter table public.far_djs enable row level security;
drop policy if exists "FAR managers read DJs" on public.far_djs;create policy "FAR managers read DJs" on public.far_djs for select to authenticated using(public.far_current_staff_role() in ('owner','deputy_manager'));
-- Browser writes intentionally disabled: all mutations go through far-dj-admin Edge Function.
