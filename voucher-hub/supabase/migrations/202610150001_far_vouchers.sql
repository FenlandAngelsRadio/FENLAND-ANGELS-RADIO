-- Additive migration. Existing FAR staff identities remain the source of staff authority.
create table public.far_voucher_settings(id boolean primary key default true check(id),sales_enabled boolean not null default false);
insert into public.far_voucher_settings(id) values(true);
create table public.far_voucher_businesses(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 160),contact_email text not null,active boolean not null default true,created_at timestamptz not null default now());
create table public.far_voucher_members(business_id uuid not null references public.far_voucher_businesses(id),email text not null check(email=lower(email)),primary key(business_id,email));
create table public.far_voucher_offers(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.far_voucher_businesses(id),title text not null,
 entitlement text not null,terms text not null,redemption_instructions text not null,face_minor integer not null check(face_minor>0),sale_minor integer not null check(sale_minor>0),
 expires_on date not null,package_name text not null,advertising_credit_minor integer not null default 0 check(advertising_credit_minor>=0),
 campaign_start date not null,campaign_end date not null,commitment text not null,active boolean not null default false,
 created_at timestamptz not null default now(),check(campaign_end>=campaign_start));
create table public.far_voucher_documents(id uuid primary key default gen_random_uuid(),offer_id uuid not null references public.far_voucher_offers(id),business_id uuid not null references public.far_voucher_businesses(id),kind text not null check(kind in ('agreement','voucher_batch')),name text not null,path text unique not null,created_at timestamptz not null default now(),check(split_part(path,'/',1)=business_id::text));
create table public.far_voucher_orders(
 id uuid primary key default gen_random_uuid(),offer_id uuid not null references public.far_voucher_offers(id),request_key uuid unique not null,
 customer_email text not null,amount_minor integer not null,currency text not null default 'GBP' check(currency='GBP'),
 status text not null default 'pending' check(status in ('pending','paid','expired','refund_review','refunded')),
 checkout_id text unique,checkout_url text,checkout_claimed_at timestamptz,created_at timestamptz not null default now(),paid_at timestamptz,
 ticket_token uuid not null default gen_random_uuid() unique,provider_transaction_id text,fee_minor integer check(fee_minor>=0));
create table public.far_voucher_stock(
 id uuid primary key default gen_random_uuid(),offer_id uuid not null references public.far_voucher_offers(id),
 code text not null unique default ('FAR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20))),supplier_code text,
 import_key uuid not null,slot integer not null,order_id uuid unique references public.far_voucher_orders(id),
 status text not null default 'available' check(status in ('available','reserved','issued','redeemed','void')),
 redeemed_at timestamptz,redeemed_by uuid,created_at timestamptz not null default now(),unique(import_key,slot),unique(offer_id,supplier_code));
create table public.far_voucher_events(id bigint generated always as identity primary key,voucher_id uuid references public.far_voucher_stock(id),actor uuid,action text not null,created_at timestamptz not null default now());
create table public.far_voucher_jobs(id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('email','pandle_sale','pandle_fee')),order_id uuid not null references public.far_voucher_orders(id),state text not null default 'pending' check(state in ('pending','processing','sent','review')),attempts integer not null default 0,lease_until timestamptz,next_attempt timestamptz not null default now(),last_error text,external_id text,unique(kind,order_id));
create index on public.far_voucher_stock(offer_id,status);
create index on public.far_voucher_jobs(state,next_attempt);
create index on public.far_voucher_members(email);
create table public.far_voucher_connector_state(name text primary key,value jsonb not null);

create function public.far_voucher_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.far_admins where user_id=auth.uid() and (lower(role) in ('owner','deputy_manager') or (jsonb_typeof(permissions)='array' and permissions ? 'vouchers')));
$$;
create function public.far_voucher_access(p_business uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.far_voucher_is_admin() or exists(select 1 from public.far_voucher_members m join public.far_voucher_businesses b on b.id=m.business_id where m.business_id=p_business and b.active and m.email=lower(auth.jwt()->>'email')));
$$;
create function public.far_voucher_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('admin',public.far_voucher_is_admin(),'businesses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.far_voucher_businesses where public.far_voucher_access(id)),'[]'::jsonb));
$$;

alter table public.far_voucher_settings enable row level security;
alter table public.far_voucher_businesses enable row level security;
alter table public.far_voucher_members enable row level security;
alter table public.far_voucher_offers enable row level security;
alter table public.far_voucher_documents enable row level security;
alter table public.far_voucher_orders enable row level security;
alter table public.far_voucher_stock enable row level security;
alter table public.far_voucher_events enable row level security;
alter table public.far_voucher_jobs enable row level security;
alter table public.far_voucher_connector_state enable row level security;
create policy "voucher businesses read" on public.far_voucher_businesses for select to authenticated using(public.far_voucher_access(id));
create policy "voucher businesses staff" on public.far_voucher_businesses for all to authenticated using(public.far_voucher_is_admin()) with check(public.far_voucher_is_admin());
create policy "voucher members staff" on public.far_voucher_members for all to authenticated using(public.far_voucher_is_admin()) with check(public.far_voucher_is_admin());
create policy "voucher offers read" on public.far_voucher_offers for select to authenticated using(public.far_voucher_access(business_id));
create policy "voucher offers staff" on public.far_voucher_offers for all to authenticated using(public.far_voucher_is_admin()) with check(public.far_voucher_is_admin());
create policy "voucher docs staff" on public.far_voucher_documents for all to authenticated using(public.far_voucher_is_admin()) with check(public.far_voucher_is_admin());
create policy "voucher orders staff" on public.far_voucher_orders for select to authenticated using(public.far_voucher_is_admin());
create policy "voucher stock read" on public.far_voucher_stock for select to authenticated using(exists(select 1 from public.far_voucher_offers o where o.id=offer_id and public.far_voucher_access(o.business_id)));
create policy "voucher events staff" on public.far_voucher_events for select to authenticated using(public.far_voucher_is_admin());
create policy "voucher jobs staff" on public.far_voucher_jobs for select to authenticated using(public.far_voucher_is_admin());
create policy "voucher settings staff" on public.far_voucher_settings for select to authenticated using(public.far_voucher_is_admin());
revoke all on public.far_voucher_settings,public.far_voucher_businesses,public.far_voucher_members,public.far_voucher_offers,public.far_voucher_documents,public.far_voucher_orders,public.far_voucher_stock,public.far_voucher_events,public.far_voucher_jobs,public.far_voucher_connector_state from anon,authenticated;
grant select,insert,update on public.far_voucher_businesses,public.far_voucher_members,public.far_voucher_offers,public.far_voucher_documents to authenticated;
grant delete on public.far_voucher_members to authenticated;
grant select on public.far_voucher_settings,public.far_voucher_orders,public.far_voucher_stock,public.far_voucher_events,public.far_voucher_jobs to authenticated;
grant all on public.far_voucher_settings,public.far_voucher_businesses,public.far_voucher_members,public.far_voucher_offers,public.far_voucher_documents,public.far_voucher_orders,public.far_voucher_stock,public.far_voucher_events,public.far_voucher_jobs,public.far_voucher_connector_state to service_role;
grant usage,select on sequence public.far_voucher_events_id_seq to service_role;

create function public.far_voucher_import(p_offer uuid,p_import uuid,p_codes jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare n integer; existing integer;
begin
 if not public.far_voucher_is_admin() then raise exception 'Staff access required' using errcode='42501'; end if;
 if jsonb_typeof(p_codes)<>'array' or jsonb_array_length(p_codes) not between 1 and 1000 then raise exception 'Upload 1 to 1000 vouchers'; end if;
 perform 1 from public.far_voucher_offers where id=p_offer for update;
 if not found then raise exception 'Offer not found'; end if;
 select count(*) into existing from public.far_voucher_stock where import_key=p_import;
 if existing>0 then
  if exists(select 1 from public.far_voucher_stock where import_key=p_import and offer_id<>p_offer) then raise exception 'Import belongs to another offer';end if;
  return existing;
 end if;
 insert into public.far_voucher_stock(offer_id,supplier_code,import_key,slot)
 select p_offer,nullif(trim(value #>> '{}'),''),p_import,ordinality::integer from jsonb_array_elements(p_codes) with ordinality;
 get diagnostics n=row_count;
 return n;
end $$;

create function public.far_voucher_lookup(p_code text,p_redeem boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.far_voucher_stock%rowtype; o public.far_voucher_offers%rowtype; b public.far_voucher_businesses%rowtype; answer jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501';end if;
 select s.* into v from public.far_voucher_stock s join public.far_voucher_offers f on f.id=s.offer_id
 where regexp_replace(upper(s.code),'[^A-Z0-9]','','g')=regexp_replace(upper(p_code),'[^A-Z0-9]','','g') and public.far_voucher_access(f.business_id) for update of s;
 if not found then return jsonb_build_object('result','not_found','message','No voucher found for your business.');end if;
 select * into o from public.far_voucher_offers where id=v.offer_id;
 select * into b from public.far_voucher_businesses where id=o.business_id;
 answer=jsonb_build_object('code',v.code,'business',b.name,'title',o.title,'entitlement',o.entitlement,'terms',o.terms,'expires_on',o.expires_on,'supplier_code',v.supplier_code,'redeemed_at',v.redeemed_at);
 if not b.active then return answer||jsonb_build_object('result','inactive','message','Business access is paused.');end if;
 if v.status='redeemed' then return answer||jsonb_build_object('result','redeemed','message','Already redeemed. Do not accept again.');end if;
 if v.status<>'issued' or not exists(select 1 from public.far_voucher_orders where id=v.order_id and status='paid') then return answer||jsonb_build_object('result','not_valid','message','This voucher is not valid for redemption.');end if;
 if o.expires_on<(now() at time zone 'Europe/London')::date then return answer||jsonb_build_object('result','expired','message','This voucher has expired.');end if;
 if not p_redeem then return answer||jsonb_build_object('result','valid','message','Valid. Confirm the offer terms, then tap Redeem.');end if;
 update public.far_voucher_stock set status='redeemed',redeemed_at=now(),redeemed_by=auth.uid() where id=v.id and status='issued';
 insert into public.far_voucher_events(voucher_id,actor,action) values(v.id,auth.uid(),'redeemed');
 return answer||jsonb_build_object('result','success','message','Redeemed successfully.','redeemed_at',now());
end $$;

create function public.far_voucher_reserve(p_offer uuid,p_email text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.far_voucher_offers%rowtype; r public.far_voucher_orders%rowtype; v uuid;
begin
 if not (select sales_enabled from public.far_voucher_settings where id) then raise exception 'Voucher sales are not open';end if;
 if length(p_email)>200 or p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid email required';end if;
 -- Serialise equal request keys, then lock the offer before selecting one stock item.
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into r from public.far_voucher_orders where request_key=p_key;
 if found then
  if r.offer_id<>p_offer or r.customer_email<>lower(trim(p_email)) then raise exception 'Request mismatch';end if;
  return to_jsonb(r);
 end if;
 select * into o from public.far_voucher_offers where id=p_offer and active and expires_on>=(now() at time zone 'Europe/London')::date for update;
 if not found or not exists(select 1 from public.far_voucher_businesses where id=o.business_id and active) then raise exception 'Offer unavailable';end if;
 if not exists(select 1 from public.far_voucher_documents where offer_id=p_offer and kind='agreement') then raise exception 'Agreement required before sales';end if;
 select id into v from public.far_voucher_stock where offer_id=p_offer and status='available' order by created_at,id limit 1 for update skip locked;
 if v is null then raise exception 'Sold out';end if;
 insert into public.far_voucher_orders(offer_id,request_key,customer_email,amount_minor) values(p_offer,p_key,lower(trim(p_email)),o.sale_minor) returning * into r;
 update public.far_voucher_stock set status='reserved',order_id=r.id where id=v;
 return to_jsonb(r);
end $$;
create function public.far_voucher_settle(p_order uuid,p_checkout text,p_amount integer,p_currency text,p_transaction text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.far_voucher_orders%rowtype; v uuid;
begin
 select * into r from public.far_voucher_orders where id=p_order for update;
 if not found or r.checkout_id is distinct from p_checkout or r.amount_minor<>p_amount or r.currency<>p_currency then raise exception 'Payment does not match order';end if;
 if r.status not in ('pending','paid') then raise exception 'Order is not payable';end if;
 select id into v from public.far_voucher_stock where order_id=r.id;
 if v is null then raise exception 'Reserved voucher missing';end if;
 if r.status='paid' then return v;end if;
 update public.far_voucher_orders set status='paid',paid_at=now(),provider_transaction_id=p_transaction where id=r.id;
 update public.far_voucher_stock set status='issued' where id=v and status='reserved';
 insert into public.far_voucher_jobs(kind,order_id) values('email',r.id),('pandle_sale',r.id) on conflict do nothing;
 insert into public.far_voucher_events(voucher_id,action) values(v,'payment_verified');
 return v;
end $$;
create function public.far_voucher_release(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.far_voucher_orders where id=p_order and status='pending' for update;
 if not found then return;end if;
 update public.far_voucher_orders set status='expired' where id=p_order;
 update public.far_voucher_stock set status='available',order_id=null where order_id=p_order and status='reserved';
end $$;
create function public.far_voucher_claim_jobs(p_limit integer default 10) returns setof public.far_voucher_jobs language sql security definer set search_path='' as $$
 update public.far_voucher_jobs set state='processing',attempts=attempts+1,lease_until=now()+interval '10 minutes'
 where id in(select id from public.far_voucher_jobs where (state='pending' or (state='processing' and lease_until<now())) and next_attempt<=now() order by next_attempt for update skip locked limit least(greatest(p_limit,1),20)) returning *;
$$;
create function public.far_voucher_ticket(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('code',s.code,'supplier_code',s.supplier_code,'status',case when f.expires_on<(now() at time zone 'Europe/London')::date then 'expired' else s.status end,'title',f.title,'business',b.name,'entitlement',f.entitlement,'terms',f.terms,'instructions',f.redemption_instructions,'expires_on',f.expires_on)
 from public.far_voucher_orders o join public.far_voucher_stock s on s.order_id=o.id join public.far_voucher_offers f on f.id=o.offer_id join public.far_voucher_businesses b on b.id=f.business_id where o.ticket_token=p_token and o.status='paid';
$$;
create function public.far_voucher_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('sales_open',(select sales_enabled from public.far_voucher_settings where id),'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'title',o.title,'business',b.name,'entitlement',o.entitlement,'terms',o.terms,'expires_on',o.expires_on,'sale_minor',o.sale_minor,'face_minor',o.face_minor,'available',(select count(*) from public.far_voucher_stock where offer_id=o.id and status='available'))) from public.far_voucher_offers o join public.far_voucher_businesses b on b.id=o.business_id where o.active and b.active and o.expires_on>=(now() at time zone 'Europe/London')::date),'[]'::jsonb));
$$;

-- Explicit function grants: payment, release and job routines are never browser callable.
do $$ declare r record;begin for r in select p.oid::regprocedure as fn,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'far_voucher_%' loop
 execute format('revoke all on function %s from public, anon, authenticated',r.fn);
 execute format('grant execute on function %s to service_role',r.fn);
 if r.proname in ('far_voucher_is_admin','far_voucher_access','far_voucher_context','far_voucher_import','far_voucher_lookup') then execute format('grant execute on function %s to authenticated',r.fn);end if;
 if r.proname in ('far_voucher_ticket','far_voucher_catalog') then execute format('grant execute on function %s to anon,authenticated',r.fn);end if;
end loop;end $$;
