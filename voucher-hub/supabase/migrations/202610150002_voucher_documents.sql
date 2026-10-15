insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('far-voucher-documents','far-voucher-documents',false,10485760,array['application/pdf','image/jpeg','image/png','text/csv']) on conflict(id) do nothing;
create policy "voucher files staff upload" on storage.objects for insert to authenticated with check(bucket_id='far-voucher-documents' and public.far_voucher_is_admin());
create policy "voucher files staff read" on storage.objects for select to authenticated using(bucket_id='far-voucher-documents' and public.far_voucher_is_admin());
-- No public access, overwrites or merchant access to source documents or agreements.
