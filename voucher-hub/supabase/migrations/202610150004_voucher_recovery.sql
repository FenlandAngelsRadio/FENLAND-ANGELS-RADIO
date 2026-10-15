alter table public.far_voucher_orders add column last_payment_error text;
alter table public.far_voucher_stock add column business_id uuid references public.far_voucher_businesses(id);
update public.far_voucher_stock s set business_id=o.business_id from public.far_voucher_offers o where o.id=s.offer_id;
alter table public.far_voucher_stock alter column business_id set not null;
alter table public.far_voucher_stock add constraint voucher_original_business_code unique(business_id,supplier_code);
create function public.far_voucher_stock_business() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select business_id into new.business_id from public.far_voucher_offers where id=new.offer_id;
 return new;
end $$;
revoke all on function public.far_voucher_stock_business() from public,anon,authenticated;
create trigger voucher_stock_business before insert on public.far_voucher_stock for each row execute function public.far_voucher_stock_business();
create table public.far_voucher_rate_limits(key text primary key,window_started timestamptz not null default now(),attempts integer not null default 1);
alter table public.far_voucher_rate_limits enable row level security;
revoke all on public.far_voucher_rate_limits from anon,authenticated;
grant all on public.far_voucher_rate_limits to service_role;
create function public.far_voucher_rate_limit(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare attempts_now integer;
begin
 insert into public.far_voucher_rate_limits(key) values(p_key) on conflict(key) do update set
 attempts=case when public.far_voucher_rate_limits.window_started<now()-interval '15 minutes' then 1 else public.far_voucher_rate_limits.attempts+1 end,
 window_started=case when public.far_voucher_rate_limits.window_started<now()-interval '15 minutes' then now() else public.far_voucher_rate_limits.window_started end
 returning attempts into attempts_now;
 delete from public.far_voucher_rate_limits where window_started<now()-interval '1 day';
 return attempts_now<=8;
end $$;
revoke all on function public.far_voucher_rate_limit(text) from public,anon,authenticated;
grant execute on function public.far_voucher_rate_limit(text) to service_role;

create function public.far_voucher_release_uncreated(p_order uuid,p_claimed timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.far_voucher_orders where id=p_order and status='pending' and checkout_id is null
 and checkout_claimed_at is not distinct from p_claimed and (checkout_claimed_at is null or checkout_claimed_at<now()-interval '2 minutes')
 and created_at<now()-interval '45 minutes' for update;
 if found then perform public.far_voucher_release(p_order);end if;
end $$;
revoke all on function public.far_voucher_release_uncreated(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.far_voucher_release_uncreated(uuid,timestamptz) to service_role;
