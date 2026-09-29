-- FAR Staff Gateway roles and permissions
-- Run once in the existing FAR Supabase project SQL Editor.
-- Existing far_admins rows are preserved.

alter table public.far_admins
  add column if not exists role text not null default 'staff',
  add column if not exists permissions jsonb not null default '[]'::jsonb;

alter table public.far_admins
  drop constraint if exists far_admins_role_check;

alter table public.far_admins
  add constraint far_admins_role_check
  check (role in ('owner','admin','presenter','news','events','sales','staff'));

-- Existing authorised FAR admins become owners so Nathaniel/Nick keep full control.
-- If far_admins currently contains anyone else, change their role after running this.
update public.far_admins
set role='owner'
where role='staff';

-- Helper examples for future staff (replace USER_UUID only after their Auth account exists):
-- Presenter/DJ:
-- insert into public.far_admins(user_id,display_name,role,permissions)
-- values ('USER_UUID','DJ InfinitI','presenter','["cloud_live"]'::jsonb);
--
-- Events team:
-- insert into public.far_admins(user_id,display_name,role,permissions)
-- values ('USER_UUID','Name','events','["events"]'::jsonb);
--
-- News:
-- insert into public.far_admins(user_id,display_name,role,permissions)
-- values ('USER_UUID','Name','news','["news"]'::jsonb);
--
-- Sales:
-- insert into public.far_admins(user_id,display_name,role,permissions)
-- values ('USER_UUID','Name','sales','["advertising"]'::jsonb);
