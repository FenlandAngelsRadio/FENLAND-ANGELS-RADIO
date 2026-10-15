-- Businesses redeem through scoped RPCs. Internal offer records include station
-- prices, advertising commitments and credit, so direct reads are staff-only.
drop policy "voucher offers read" on public.far_voucher_offers;
create policy "voucher offers staff read" on public.far_voucher_offers for select to authenticated using(public.far_voucher_is_admin());
