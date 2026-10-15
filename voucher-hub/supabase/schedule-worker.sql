-- Run only after far-voucher-api is deployed and its WORKER_SECRET is set.
-- Create two Vault secrets in the Supabase dashboard first:
-- far_voucher_worker_url = https://<project>.supabase.co/functions/v1/far-voucher-api?action=worker
-- far_voucher_worker_token = exactly the server WORKER_SECRET
-- Values remain in Vault, never in Git or this file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('far-voucher-worker','* * * * *', $job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='far_voucher_worker_url'),
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='far_voucher_worker_token')),
  body:='{}'::jsonb,timeout_milliseconds:=55000
 );
$job$);
