-- FAR supplies £1 of non-audio advertising per £1 of vouchers at face value.
alter table public.far_voucher_offers add column agreed_quantity integer not null default 1 check(agreed_quantity between 1 and 1000000);
create function public.far_voucher_calculate_credit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.agreed_quantity<(select count(*) from public.far_voucher_stock where offer_id=new.id) then raise exception 'The agreed quantity cannot be less than stock already uploaded';end if;
 new.advertising_credit_minor=new.face_minor::bigint*new.agreed_quantity;
 new.sale_minor=((new.face_minor::bigint+1)/2)::integer;
 return new;
end $$;
revoke all on function public.far_voucher_calculate_credit() from public,anon,authenticated;
create trigger voucher_calculate_credit before insert or update on public.far_voucher_offers for each row execute function public.far_voucher_calculate_credit();
alter table public.far_voucher_offers add constraint voucher_exchange_value check(advertising_credit_minor::bigint=face_minor::bigint*agreed_quantity);
alter table public.far_voucher_offers add constraint voucher_half_price check(sale_minor=((face_minor::bigint+1)/2)::integer);

-- Quantity is an agreement, not unlimited replenishable stock.
create function public.far_voucher_limit_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare agreed integer; loaded integer;
begin
 select agreed_quantity into agreed from public.far_voucher_offers where id=new.offer_id for update;
 select count(*) into loaded from public.far_voucher_stock where offer_id=new.offer_id;
 if loaded>=agreed then raise exception 'This agreement already has its full voucher quantity';end if;
 return new;
end $$;
revoke all on function public.far_voucher_limit_stock() from public,anon,authenticated;
create trigger voucher_limit_stock before insert on public.far_voucher_stock for each row execute function public.far_voucher_limit_stock();

create function public.far_voucher_require_complete_stock() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.far_voucher_offers o where o.id=new.offer_id and o.agreed_quantity=(select count(*) from public.far_voucher_stock where offer_id=o.id)) then raise exception 'Upload the full agreed voucher quantity before selling';end if;
 return new;
end $$;
revoke all on function public.far_voucher_require_complete_stock() from public,anon,authenticated;
create trigger voucher_complete_stock before insert on public.far_voucher_orders for each row execute function public.far_voucher_require_complete_stock();
