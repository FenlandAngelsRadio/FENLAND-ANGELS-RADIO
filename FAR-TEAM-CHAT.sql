begin;
create or replace function public.far_team_chat_member() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.far_admins where user_id=auth.uid())
$$;
revoke all on function public.far_team_chat_member() from public,anon;
grant execute on function public.far_team_chat_member() to authenticated;

create table if not exists public.far_team_chat (
 id bigint generated always as identity primary key,
 author_id uuid references auth.users(id) on delete set null,
 author_name text not null,
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 client_id uuid not null,
 unique(author_id,client_id)
);
create index if not exists far_team_chat_author_time on public.far_team_chat(author_id,created_at desc);
alter table public.far_team_chat enable row level security;
revoke all on public.far_team_chat from public,anon,authenticated;
grant select on public.far_team_chat to authenticated;
drop policy if exists "FAR staff read team chat" on public.far_team_chat;
create policy "FAR staff read team chat" on public.far_team_chat for select to authenticated using(public.far_team_chat_member());

create or replace function public.far_team_chat_send(p_body text,p_client_id uuid)
returns public.far_team_chat language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.far_team_chat; actor text;
begin
 if not public.far_team_chat_member() then raise exception 'FAR staff sign-in required';end if;
 if p_client_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
  raise exception 'Enter a message between 1 and 2000 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,61204));
 select * into result from public.far_team_chat where author_id=auth.uid() and client_id=p_client_id;
 if found then return result;end if;
 if exists(select 1 from public.far_team_chat where author_id=auth.uid() and created_at>now()-interval '3 seconds') then
  raise exception 'Please wait a few seconds before sending again';end if;
 select coalesce(nullif(btrim(display_name),''),'FAR colleague') into actor from public.far_admins where user_id=auth.uid();
 insert into public.far_team_chat(author_id,author_name,body,client_id) values(auth.uid(),actor,btrim(p_body),p_client_id) returning * into result;
 return result;
end $$;
revoke all on function public.far_team_chat_send(text,uuid) from public,anon;
grant execute on function public.far_team_chat_send(text,uuid) to authenticated;
commit;
