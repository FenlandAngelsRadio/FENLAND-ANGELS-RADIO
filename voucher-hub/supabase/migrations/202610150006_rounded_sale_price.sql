-- Price: round the voucher's face value to the nearest £1, with 50p rounding up,
-- then sell at 50% of that rounded value. Advertising credit uses actual face value.
create or replace function public.far_voucher_calculate_credit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.agreed_quantity<(select count(*) from public.far_voucher_stock where offer_id=new.id) then raise exception 'The agreed quantity cannot be less than stock already uploaded';end if;
 new.advertising_credit_minor=new.face_minor::bigint*new.agreed_quantity;
 new.sale_minor=(((new.face_minor::bigint+50)/100)*50)::integer;
 if new.sale_minor<=0 then raise exception 'Voucher face value must round to at least £1';end if;
 return new;
end $$;
revoke all on function public.far_voucher_calculate_credit() from public,anon,authenticated;
alter table public.far_voucher_offers drop constraint voucher_half_price;
alter table public.far_voucher_offers add constraint voucher_rounded_half_price check(sale_minor=(((face_minor::bigint+50)/100)*50)::integer);
