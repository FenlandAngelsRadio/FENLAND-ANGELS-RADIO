begin;
alter table public.far_team_chat add column if not exists deleted_at timestamptz;
alter table public.far_team_chat add column if not exists moderated_at timestamptz;
alter table public.far_team_chat add column if not exists moderated_by uuid references auth.users(id) on delete set null;
create index if not exists far_team_chat_moderated on public.far_team_chat(moderated_at desc) where moderated_at is not null;
create or replace function public.far_team_chat_manager() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.far_admins where user_id=auth.uid() and lower(role) in ('owner','deputy_manager'))
$$;
revoke all on function public.far_team_chat_manager() from public,anon;
grant execute on function public.far_team_chat_manager() to authenticated;
drop policy if exists "FAR staff read team chat" on public.far_team_chat;
create policy "FAR staff read team chat" on public.far_team_chat for select to authenticated using(public.far_team_chat_member() and (deleted_at is null or public.far_team_chat_manager()));
create or replace function public.far_team_chat_moderate(p_id bigint,p_deleted boolean) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.far_team_chat_manager() then raise exception 'Only FAR management can delete or restore team messages';end if;
 if p_deleted is null then raise exception 'Choose delete or restore';end if;
 update public.far_team_chat set deleted_at=case when p_deleted then clock_timestamp() else null end,moderated_at=clock_timestamp(),moderated_by=auth.uid() where id=p_id;
 if not found then raise exception 'Message no longer exists';end if;
 return true;
end $$;
revoke all on function public.far_team_chat_moderate(bigint,boolean) from public,anon;
grant execute on function public.far_team_chat_moderate(bigint,boolean) to authenticated;
create or replace function public.far_team_chat_revision() returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.far_team_chat_member() then raise exception 'FAR staff sign-in required';end if;
 return coalesce((select max(moderated_at)::text from public.far_team_chat),'initial');
end $$;
revoke all on function public.far_team_chat_revision() from public,anon;
grant execute on function public.far_team_chat_revision() to authenticated;
create or replace function public.far_team_chat_send(p_body text,p_client_id uuid)
returns public.far_team_chat language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.far_team_chat; actor text;
begin
 if not public.far_team_chat_member() then raise exception 'FAR staff sign-in required';end if;
 if p_client_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
  raise exception 'Enter a message between 1 and 2000 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,61204));
 select * into result from public.far_team_chat where author_id=auth.uid() and client_id=p_client_id;
 if found then if result.deleted_at is not null then raise exception 'This message was removed by management';end if;return result;end if;
 if exists(select 1 from public.far_team_chat where author_id=auth.uid() and created_at>now()-interval '3 seconds') then
  raise exception 'Please wait a few seconds before sending again';end if;
 select coalesce(nullif(btrim(display_name),''),'FAR colleague') into actor from public.far_admins where user_id=auth.uid();
 insert into public.far_team_chat(author_id,author_name,body,client_id) values(auth.uid(),actor,btrim(p_body),p_client_id) returning * into result;
 return result;
end $$;
revoke all on function public.far_team_chat_send(text,uuid) from public,anon;
grant execute on function public.far_team_chat_send(text,uuid) to authenticated;
commit;
