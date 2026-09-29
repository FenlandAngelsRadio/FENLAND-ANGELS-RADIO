-- FAR Owner-only staff management policies.
-- Run after FAR-STAFF-GATEWAY-SETUP.sql.

alter table public.far_admins enable row level security;

drop policy if exists "FAR staff can read own access" on public.far_admins;
drop policy if exists "FAR owners can read staff" on public.far_admins;
drop policy if exists "FAR owners can add staff" on public.far_admins;
drop policy if exists "FAR owners can update staff" on public.far_admins;
drop policy if exists "FAR owners can remove staff" on public.far_admins;

create policy "FAR staff can read own access"
on public.far_admins for select
to authenticated
using (user_id = auth.uid());

create policy "FAR owners can read staff"
on public.far_admins for select
to authenticated
using (
  exists (
    select 1 from public.far_admins me
    where me.user_id = auth.uid()
      and me.role in ('owner','admin')
  )
);

create policy "FAR owners can add staff"
on public.far_admins for insert
to authenticated
with check (
  exists (
    select 1 from public.far_admins me
    where me.user_id = auth.uid()
      and me.role in ('owner','admin')
  )
  and role <> 'owner'
);

create policy "FAR owners can update staff"
on public.far_admins for update
to authenticated
using (
  exists (
    select 1 from public.far_admins me
    where me.user_id = auth.uid()
      and me.role in ('owner','admin')
  )
  and role <> 'owner'
)
with check (role <> 'owner');

create policy "FAR owners can remove staff"
on public.far_admins for delete
to authenticated
using (
  exists (
    select 1 from public.far_admins me
    where me.user_id = auth.uid()
      and me.role in ('owner','admin')
  )
  and role <> 'owner'
);
