-- App-level burst control. This does not replace provider/gateway flood protection.
create function public.far_voucher_rate_limit_window(p_key text,p_limit integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare attempts_now integer;
begin
 if p_key is null or p_key!~'^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid rate-limit configuration';end if;
 insert into public.far_voucher_rate_limits(key) values(p_key) on conflict(key) do update set
 attempts=case when public.far_voucher_rate_limits.window_started<now()-interval '15 minutes' then 1 else public.far_voucher_rate_limits.attempts+1 end,
 window_started=case when public.far_voucher_rate_limits.window_started<now()-interval '15 minutes' then now() else public.far_voucher_rate_limits.window_started end
 returning attempts into attempts_now;
 delete from public.far_voucher_rate_limits where window_started<now()-interval '1 day';
 return attempts_now<=p_limit;
end $$;
revoke all on function public.far_voucher_rate_limit_window(text,integer) from public,anon,authenticated;
grant execute on function public.far_voucher_rate_limit_window(text,integer) to service_role;
