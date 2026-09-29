-- FAR Staff Gateway security policies
-- Hierarchy:
-- owner: Nathaniel - may manage all non-owner staff, including deputy_manager
-- deputy_manager: Nick - may manage ordinary staff, but never owner/deputy_manager
-- admin: operational access only; cannot manage privileged accounts

alter table public.far_admins enable row level security;

drop policy if exists "FAR staff can read own access" on public.far_admins;
drop policy if exists "FAR management can read staff" on public.far_admins;
drop policy if exists "FAR management can add staff" on public.far_admins;
drop policy if exists "FAR management can update staff" on public.far_admins;
drop policy if exists "FAR management can remove staff" on public.far_admins;
drop policy if exists "FAR owners can read staff" on public.far_admins;
drop policy if exists "FAR owners can add staff" on public.far_admins;
drop policy if exists "FAR owners can update staff" on public.far_admins;
drop policy if exists "FAR owners can remove staff" on public.far_admins;

create policy "FAR staff can read own access"
on public.far_admins for select to authenticated
using (user_id = auth.uid());

create policy "FAR management can read staff"
on public.far_admins for select to authenticated
using (
  exists (
    select 1 from public.far_admins me
    where me.user_id = auth.uid()
      and me.role in ('owner','deputy_manager')
  )
);

create policy "FAR management can add staff"
on public.far_admins for insert to authenticated
with check (
  exists (
    select 1 from public.far_admins me
    where me.user_id = auth.uid()
      and (
        (me.role = 'owner' and role <> 'owner')
        or
        (me.role = 'deputy_manager' and role not in ('owner','deputy_manager'))
      )
  )
);

create policy "FAR management can update staff"
on public.far_admins for update to authenticated
using (
  exists (
    select 1 from public.far_admins me
    where me.user_id = auth.uid()
      and (
        (me.role = 'owner' and far_admins.role <> 'owner')
        or
        (me.role = 'deputy_manager' and far_admins.role not in ('owner','deputy_manager'))
      )
  )
)
with check (
  role <> 'owner'
  and exists (
    select 1 from public.far_admins me
    where me.user_id = auth.uid()
      and (
        me.role = 'owner'
        or (me.role = 'deputy_manager' and role <> 'deputy_manager')
      )
  )
);

create policy "FAR management can remove staff"
on public.far_admins for delete to authenticated
using (
  exists (
    select 1 from public.far_admins me
    where me.user_id = auth.uid()
      and (
        (me.role = 'owner' and far_admins.role <> 'owner')
        or
        (me.role = 'deputy_manager' and far_admins.role not in ('owner','deputy_manager'))
      )
  )
);
