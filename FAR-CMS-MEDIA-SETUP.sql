-- FAR CMS media storage
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('far-cms-media','far-cms-media',true,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "Public read FAR CMS media" on storage.objects;
create policy "Public read FAR CMS media" on storage.objects for select to public using (bucket_id='far-cms-media');

drop policy if exists "FAR admins upload CMS media" on storage.objects;
create policy "FAR admins upload CMS media" on storage.objects for insert to authenticated
with check (bucket_id='far-cms-media' and exists(select 1 from public.far_admins a where a.user_id=auth.uid() and lower(coalesce(a.role,'')) in ('owner','deputy_manager')));

drop policy if exists "FAR admins update CMS media" on storage.objects;
create policy "FAR admins update CMS media" on storage.objects for update to authenticated
using (bucket_id='far-cms-media' and exists(select 1 from public.far_admins a where a.user_id=auth.uid() and lower(coalesce(a.role,'')) in ('owner','deputy_manager')))
with check (bucket_id='far-cms-media');

drop policy if exists "FAR admins delete CMS media" on storage.objects;
create policy "FAR admins delete CMS media" on storage.objects for delete to authenticated
using (bucket_id='far-cms-media' and exists(select 1 from public.far_admins a where a.user_id=auth.uid() and lower(coalesce(a.role,'')) in ('owner','deputy_manager')));
