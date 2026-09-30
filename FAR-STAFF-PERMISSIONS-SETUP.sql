-- FAR Website Management permissions
-- Run once in Supabase SQL Editor.
-- Management remains the only authority allowed to grant/revoke staff permissions.

alter table public.far_admins
  add column if not exists permissions jsonb not null default '[]'::jsonb;

create or replace function public.far_is_management()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.far_admins
    where user_id=auth.uid()
      and lower(coalesce(role,'')) in ('owner','deputy_manager')
  );
$$;

create or replace function public.far_has_permission(permission_name text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.far_admins
    where user_id=auth.uid()
      and (
        lower(coalesce(role,'')) in ('owner','deputy_manager')
        or coalesce(permissions,'[]'::jsonb) ? permission_name
      )
  );
$$;

grant execute on function public.far_is_management() to authenticated;
grant execute on function public.far_has_permission(text) to authenticated;

alter table public.far_admins enable row level security;
drop policy if exists "FAR staff can read own admin profile" on public.far_admins;
create policy "FAR staff can read own admin profile"
on public.far_admins for select to authenticated
using (user_id=auth.uid() or public.far_is_management());

drop policy if exists "FAR management can update staff permissions" on public.far_admins;
create policy "FAR management can update staff permissions"
on public.far_admins for update to authenticated
using (public.far_is_management())
with check (public.far_is_management());

-- Protect the current CMS modules at database level.
drop policy if exists "FAR admins can manage custom pages" on public.far_custom_pages;
drop policy if exists "FAR management can manage custom pages" on public.far_custom_pages;
create policy "FAR authorised staff can manage custom pages"
on public.far_custom_pages for all to authenticated
using (public.far_has_permission('pages'))
with check (public.far_has_permission('pages'));

drop policy if exists "FAR admins can manage page blocks" on public.far_page_blocks;
drop policy if exists "FAR management can manage page blocks" on public.far_page_blocks;
create policy "FAR authorised staff can manage page blocks"
on public.far_page_blocks for all to authenticated
using (public.far_has_permission('pages'))
with check (public.far_has_permission('pages'));

drop policy if exists "FAR admins can manage site content" on public.far_site_content;
drop policy if exists "FAR management can manage site content" on public.far_site_content;
create policy "FAR authorised staff can manage site content"
on public.far_site_content for all to authenticated
using (public.far_has_permission('website_content'))
with check (public.far_has_permission('website_content'));

drop policy if exists "FAR admins can manage ad packages" on public.far_ad_packages;
drop policy if exists "FAR management can manage ad packages" on public.far_ad_packages;
create policy "FAR authorised staff can manage ad packages"
on public.far_ad_packages for all to authenticated
using (public.far_has_permission('advertising'))
with check (public.far_has_permission('advertising'));

drop policy if exists "FAR admins can manage schedule" on public.far_schedule;
create policy "FAR authorised staff can manage schedule"
on public.far_schedule for all to authenticated
using (public.far_has_permission('schedule'))
with check (public.far_has_permission('schedule'));

-- CMS media: replace broad management write policies with permission-aware writes.
drop policy if exists "FAR admins can upload CMS media" on storage.objects;
drop policy if exists "FAR admins can update CMS media" on storage.objects;
drop policy if exists "FAR admins can delete CMS media" on storage.objects;
drop policy if exists "FAR management can upload CMS media" on storage.objects;
drop policy if exists "FAR management can update CMS media" on storage.objects;
drop policy if exists "FAR management can delete CMS media" on storage.objects;

create policy "FAR authorised staff can upload CMS media"
on storage.objects for insert to authenticated
with check (bucket_id='far-cms-media' and (public.far_has_permission('pages') or public.far_has_permission('website_content') or public.far_has_permission('podcasts')));

create policy "FAR authorised staff can update CMS media"
on storage.objects for update to authenticated
using (bucket_id='far-cms-media' and (public.far_has_permission('pages') or public.far_has_permission('website_content') or public.far_has_permission('podcasts')))
with check (bucket_id='far-cms-media' and (public.far_has_permission('pages') or public.far_has_permission('website_content') or public.far_has_permission('podcasts')));

create policy "FAR authorised staff can delete CMS media"
on storage.objects for delete to authenticated
using (bucket_id='far-cms-media' and (public.far_has_permission('pages') or public.far_has_permission('website_content') or public.far_has_permission('podcasts')));
