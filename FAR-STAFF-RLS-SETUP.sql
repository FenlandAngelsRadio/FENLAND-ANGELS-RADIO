-- FAR Staff Gateway RLS - recursion-safe version
-- Uses a SECURITY DEFINER helper so policies do not query far_admins recursively.

create or replace function public.far_current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.far_admins
  where user_id = auth.uid()
  limit 1
$$;

revoke all on function public.far_current_staff_role() from public;
grant execute on function public.far_current_staff_role() to authenticated;

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
using (public.far_current_staff_role() in ('owner','deputy_manager'));

create policy "FAR management can add staff"
on public.far_admins for insert to authenticated
with check (
  (public.far_current_staff_role() = 'owner' and role <> 'owner')
  or
  (public.far_current_staff_role() = 'deputy_manager'
    and role not in ('owner','deputy_manager'))
);

create policy "FAR management can update staff"
on public.far_admins for update to authenticated
using (
  (public.far_current_staff_role() = 'owner' and role <> 'owner')
  or
  (public.far_current_staff_role() = 'deputy_manager'
    and role not in ('owner','deputy_manager'))
)
with check (
  (public.far_current_staff_role() = 'owner' and role <> 'owner')
  or
  (public.far_current_staff_role() = 'deputy_manager'
    and role not in ('owner','deputy_manager'))
);

create policy "FAR management can remove staff"
on public.far_admins for delete to authenticated
using (
  (public.far_current_staff_role() = 'owner' and role <> 'owner')
  or
  (public.far_current_staff_role() = 'deputy_manager'
    and role not in ('owner','deputy_manager'))
);
