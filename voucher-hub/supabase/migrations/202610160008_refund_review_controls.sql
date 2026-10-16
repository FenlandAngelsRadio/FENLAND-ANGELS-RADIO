-- Staff review controls do not move money. SumUp refunds remain an owner action.
alter table public.far_voucher_orders add column review_source text check(review_source in ('staff_hold','provider_reversal'));
update public.far_voucher_orders set review_source='provider_reversal' where status='refund_review';

create function public.far_voucher_review_hold(p_order uuid,p_actor uuid,p_release boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.far_voucher_orders%rowtype; event_name text;
begin
 if not exists(select 1 from public.far_admins where user_id=p_actor and lower(role) in ('owner','deputy_manager')) then raise exception 'Management access required';end if;
 select * into r from public.far_voucher_orders where id=p_order for update;
 if not found then raise exception 'Sale not found';end if;
 if p_release then
  if r.status<>'refund_review' or r.review_source is distinct from 'staff_hold' then raise exception 'Only a staff review pause can be released';end if;
  -- The server must verify the provider payment immediately before this service-only call.
  update public.far_voucher_orders set status='paid',review_source=null,last_payment_error=null where id=p_order;
  update public.far_voucher_stock set status='issued' where order_id=p_order and status='void';
  update public.far_voucher_jobs set state='pending',lease_until=null,next_attempt=now(),last_error=null
   where order_id=p_order and state='review' and last_error='Voucher paused for review. No refund has been made.';
  event_name:='review_pause_released';
 else
  if r.status='refund_review' and r.review_source='staff_hold' then return jsonb_build_object('status','refund_review','message','This voucher is already paused. No refund has been made.');end if;
  if r.status<>'paid' then raise exception 'Only a paid sale can be paused';end if;
  update public.far_voucher_orders set status='refund_review',review_source='staff_hold',last_payment_error='Voucher paused for review. No refund has been made.' where id=p_order;
  update public.far_voucher_stock set status='void' where order_id=p_order and status='issued';
  update public.far_voucher_jobs set state='review',lease_until=null,last_error='Voucher paused for review. No refund has been made.'
   where order_id=p_order and state in ('pending','review');
  event_name:='review_pause';
 end if;
 insert into public.far_voucher_events(voucher_id,actor,action) select id,p_actor,event_name from public.far_voucher_stock where order_id=p_order;
 return jsonb_build_object('status',case when p_release then 'paid' else 'refund_review' end,'message',case when p_release then 'Pause released after the server verified the payment. Redeemed vouchers remain redeemed.' else 'Voucher paused. No refund has been made. Review the sale in SumUp.' end);
end $$;
revoke all on function public.far_voucher_review_hold(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.far_voucher_review_hold(uuid,uuid,boolean) to service_role;

create or replace function public.far_voucher_refund_review(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.far_voucher_orders%rowtype;
begin
 select * into r from public.far_voucher_orders where id=p_order and status in ('paid','refund_review') for update;
 if not found then return;end if;
 update public.far_voucher_orders set status='refund_review',review_source='provider_reversal' where id=p_order;
 update public.far_voucher_stock set status='void' where order_id=p_order and status='issued';
 update public.far_voucher_jobs set state='review',last_error='Payment refunded or reversed. Reconcile the original sale and refund.' where order_id=p_order and state<>'sent';
 if r.review_source is distinct from 'provider_reversal' then
  insert into public.far_voucher_events(voucher_id,action) select id,'provider_reversal' from public.far_voucher_stock where order_id=p_order;
 end if;
end $$;
revoke all on function public.far_voucher_refund_review(uuid) from public,anon,authenticated;
grant execute on function public.far_voucher_refund_review(uuid) to service_role;
