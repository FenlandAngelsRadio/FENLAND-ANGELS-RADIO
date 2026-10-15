-- Keep sold terms stable and prevent files being attached to a different business.
alter table public.far_voucher_orders add column last_checked_at timestamptz;
drop policy "voucher stock read" on public.far_voucher_stock;
create policy "voucher stock staff" on public.far_voucher_stock for select to authenticated using(public.far_voucher_is_admin());
alter table public.far_voucher_offers add constraint voucher_offer_business_pair unique(id,business_id);
alter table public.far_voucher_documents add constraint voucher_document_business_match foreign key(offer_id,business_id) references public.far_voucher_offers(id,business_id);
create function public.far_voucher_protect_offer() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.far_voucher_orders where offer_id=old.id) and
 (to_jsonb(new)-'active') is distinct from (to_jsonb(old)-'active') then
  raise exception 'This offer has orders. Create a new offer to change its terms or dates.';
 end if;
 return new;
end $$;
revoke all on function public.far_voucher_protect_offer() from public,anon,authenticated;
create trigger voucher_protect_sold_offer before update on public.far_voucher_offers for each row execute function public.far_voucher_protect_offer();

-- Claim external checkout creation without trusting a customer to set its ID.
create function public.far_voucher_claim_checkout(p_order uuid) returns boolean language sql security definer set search_path='' as $$
 with claimed as(update public.far_voucher_orders set checkout_claimed_at=now()
 where id=p_order and status='pending' and checkout_id is null and (checkout_claimed_at is null or checkout_claimed_at<now()-interval '2 minutes') returning id)
 select exists(select 1 from claimed);
$$;
revoke all on function public.far_voucher_claim_checkout(uuid) from public,anon,authenticated;
grant execute on function public.far_voucher_claim_checkout(uuid) to service_role;

-- A verified refund is an exception to reconcile, never stock to sell again.
create function public.far_voucher_refund_review(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.far_voucher_orders where id=p_order and status='paid' for update;
 if not found then return;end if;
 update public.far_voucher_orders set status='refund_review' where id=p_order;
 update public.far_voucher_stock set status='void' where order_id=p_order and status='issued';
 update public.far_voucher_jobs set state='review',last_error='Payment refunded. Reconcile the original sale and refund.' where order_id=p_order and kind like 'pandle_%' and state<>'sent';
end $$;
revoke all on function public.far_voucher_refund_review(uuid) from public,anon,authenticated;
grant execute on function public.far_voucher_refund_review(uuid) to service_role;

-- Serialise Pandle access: its authentication headers rotate after requests.
create function public.far_voucher_connector_lock() returns boolean language sql security definer set search_path='' as $$
 with acquired as(insert into public.far_voucher_connector_state(name,value) values('pandle_lock',jsonb_build_object('until',now()+interval '5 minutes'))
 on conflict(name) do update set value=excluded.value where (public.far_voucher_connector_state.value->>'until')::timestamptz<now() returning name)
 select exists(select 1 from acquired);
$$;
revoke all on function public.far_voucher_connector_lock() from public,anon,authenticated;
grant execute on function public.far_voucher_connector_lock() to service_role;
