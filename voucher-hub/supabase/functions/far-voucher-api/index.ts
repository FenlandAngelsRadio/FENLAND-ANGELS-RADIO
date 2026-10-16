import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {minor,verifyPayment,bankEntry,ticketEmail,isReversed} from './core.mjs';
import {pandleMapping,pandleSession,pandleOAuthToken,pandleConnection} from './integrations.mjs';

const env=(name:string)=>Deno.env.get(name)||'';
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const origin=env('APP_ORIGIN')||'https://fenlandangelsradio.co.uk';
const appUrl=env('APP_URL')||'https://fenlandangelsradio.co.uk/voucher-app.html';
const merchant=env('SUMUP_MERCHANT_CODE');
const emailKey=()=>env('FAR_VOUCHER_RESEND_API_KEY')||env('RESEND_API_KEY');
const sumupBase='https://api.sumup.com';
const check=(r:any)=>{if(r.error)throw Error(r.error.message);return r.data;};
const rpc=async(name:string,args:Record<string,unknown>={})=>check(await db.rpc(name,args));
const one=async(table:string,id:string)=>check(await db.from(table).select('*').eq('id',id).single());
const update=async(table:string,id:string,value:any)=>check(await db.from(table).update(value).eq('id',id));
const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}});
async function provider(path:string,init:RequestInit={}){
 const r=await fetch(sumupBase+path,{...init,signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env('SUMUP_API_KEY')}`,'Content-Type':'application/json'}});
 if(!r.ok)throw Error(`SumUp request failed (${r.status})`);return await r.json();
}
async function reconcile(order:any){
 if(!order.checkout_id){
  const list=await provider(`/v0.1/checkouts?checkout_reference=${encodeURIComponent(order.id)}`);
  if(!Array.isArray(list))throw Error('Unexpected checkout recovery response');
  const matches=list.filter((p:any)=>p.checkout_reference===order.id);
  if(matches.length>1)throw Error('Duplicate checkout needs review');
  if(matches.length===0){await rpc('far_voucher_release_uncreated',{p_order:order.id,p_claimed:order.checkout_claimed_at});await update('far_voucher_orders',order.id,{last_checked_at:new Date().toISOString()});return {status:'pending'};}
  const payment=matches[0];
  if(minor(payment.amount)!==order.amount_minor||payment.currency!=='GBP'||payment.merchant_code!==merchant)throw Error('Recovered checkout mismatch');
  await update('far_voucher_orders',order.id,{checkout_id:payment.id,checkout_url:payment.hosted_checkout_url||null});order={...order,checkout_id:payment.id};
 }
 const checkout=await provider(`/v0.1/checkouts/${encodeURIComponent(order.checkout_id)}`);
 // Always establish ownership before reacting to any status, including expiry.
 if(checkout.id!==order.checkout_id||checkout.checkout_reference!==order.id||minor(checkout.amount)!==order.amount_minor||checkout.currency!=='GBP'||checkout.merchant_code!==merchant)throw Error('Payment reference mismatch');
 if(checkout.status==='EXPIRED'&&order.status==='pending')await rpc('far_voucher_release',{p_order:order.id});
 if(checkout.status==='PAID'){
  const transaction=await provider(`/v2.1/merchants/${encodeURIComponent(merchant)}/transactions?id=${encodeURIComponent(checkout.transaction_id)}`);
  if(transaction.id!==checkout.transaction_id||transaction.merchant_code!==merchant||transaction.currency!=='GBP'||minor(transaction.amount)!==order.amount_minor)throw Error('Transaction reference mismatch');
  if(isReversed(transaction)){
   if(order.status==='pending')await rpc('far_voucher_settle',{p_order:order.id,p_checkout:checkout.id,p_amount:order.amount_minor,p_currency:'GBP',p_transaction:transaction.id});
   await rpc('far_voucher_refund_review',{p_order:order.id});
   return {status:'refund_review'};
  }
  if(verifyPayment(order,checkout,transaction,merchant)){
   await rpc('far_voucher_settle',{p_order:order.id,p_checkout:checkout.id,p_amount:minor(checkout.amount),p_currency:checkout.currency,p_transaction:transaction.id});
   if(transaction.fee_amount!=null){
    const fee=minor(transaction.fee_amount);
    if(fee>=0&&fee<=order.amount_minor){await update('far_voucher_orders',order.id,{fee_minor:fee});if(fee>0)check(await db.from('far_voucher_jobs').upsert({kind:'pandle_fee',order_id:order.id},{onConflict:'kind,order_id',ignoreDuplicates:true}));}
   }
  }
 }
 // FAILED is a failed attempt; it does not release stock for a retryable checkout.
 await update('far_voucher_orders',order.id,{last_checked_at:new Date().toISOString(),last_payment_error:null});
 return {status:(await one('far_voucher_orders',order.id)).status};
}
async function checkout(input:any){
 if(env('SALES_ENABLED')!=='true')throw Error('Voucher sales are not open yet');
 if(!env('SUMUP_API_KEY')||!merchant||!appUrl)throw Error('Payments are not connected');
 const order=await rpc('far_voucher_reserve',{p_offer:input.offer,p_email:input.email,p_key:input.key});
 if(order.status!=='pending')return {status:order.status};
 if(order.checkout_url)return {url:order.checkout_url};
 if(!await rpc('far_voucher_claim_checkout',{p_order:order.id}))return {waiting:true};
 // Recover after a previous request timed out before saving its checkout ID.
 const existing=await provider(`/v0.1/checkouts?checkout_reference=${encodeURIComponent(order.id)}`);
 let payment=Array.isArray(existing)?existing.find((x:any)=>x.checkout_reference===order.id):null;
 if(!payment)payment=await provider('/v0.1/checkouts',{method:'POST',body:JSON.stringify({checkout_reference:order.id,amount:order.amount_minor/100,currency:'GBP',merchant_code:merchant,description:'FAR local business voucher',valid_until:new Date(Date.now()+30*60000).toISOString(),return_url:`${env('SUPABASE_URL')}/functions/v1/far-voucher-api?action=webhook`,redirect_url:`${appUrl}?ticket=${order.ticket_token}`,hosted_checkout:{enabled:true}})});
 if(payment.checkout_reference!==order.id||minor(payment.amount)!==order.amount_minor||payment.currency!=='GBP'||payment.merchant_code!==merchant)throw Error('Unexpected checkout response');
 if(!payment.hosted_checkout_url||new URL(payment.hosted_checkout_url).protocol!=='https:')throw Error('Secure checkout link unavailable');
 await update('far_voucher_orders',order.id,{checkout_id:payment.id,checkout_url:payment.hosted_checkout_url});
 return {url:payment.hosted_checkout_url};
}
async function pandle(job:any,order:any){
 if(env('PANDLE_ENABLED')!=='true')throw Error('Pandle is not connected; sale is safely queued');
 if(!await rpc('far_voucher_connector_lock'))throw Error('Accounting connection is busy; retry later');
 try{
  const mappingState=check(await db.from('far_voucher_connector_state').select('value').eq('name','pandle_mapping').maybeSingle());
  const mapping=mappingState?.value||JSON.parse(env('PANDLE_MAPPING'));
  const body=bankEntry(order,mapping,job.kind);
  const saved=check(await db.from('far_voucher_connector_state').select('value').eq('name','pandle_auth').maybeSingle());
  const auth=saved?.value||JSON.parse(env('PANDLE_AUTH_JSON'));
  const {request}=pandleConnection(auth,{clientId:env('PANDLE_OAUTH_CLIENT_ID'),clientSecret:env('PANDLE_OAUTH_CLIENT_SECRET'),save:async(value:any)=>{check(await db.from('far_voucher_connector_state').upsert({name:'pandle_auth',value}));}});
  const base=`/companies/${mapping.company}/bank_accounts/${mapping.bank}/bank_transactions`;
  // Pandle has no documented idempotency header: reconcile the exact stable marker.
  const deadline=Date.now()+45000;
  for(let page=1;page<=1000;page++){
   if(Date.now()>deadline)throw Error('Accounting history search needs review');
   const result=await request(`${base}?page=${page}&size=100`);
   if(!Array.isArray(result.data))throw Error('Unexpected Pandle response');
   const matches=result.data.filter((row:any)=>row.attributes?.description===body.bank_transaction.description);
   if(matches.length>1)throw Error('Duplicate accounting entries need review');
   if(matches.length===1){
    const attrs=matches[0].attributes;
    if(minor(attrs['total-amount']??attrs.total_amount)!==minor(body.bank_transaction.total_amount))throw Error('Existing accounting entry has a different amount');
    return String(matches[0].id);
   }
   if(result.data.length===0){
    // After an uncertain previous POST, only reconcile; never silently POST again.
    if(job.external_id==='uncertain')throw Error('Previous accounting request needs reconciliation before retrying');
    await update('far_voucher_jobs',job.id,{external_id:'uncertain'});
    const posted=await request(base,{method:'POST',body:JSON.stringify(body)});
    if(!posted.data?.id)throw Error('Accounting response needs review');
    return String(posted.data.id);
   }
  }
  throw Error('Accounting history exceeds reconciliation limit');
 }finally{check(await db.from('far_voucher_connector_state').delete().eq('name','pandle_lock'));}
}
async function pandleAccounts(request:any){
 const deadline=Date.now()+65000;
 const list=async(path:string)=>{const all=[];for(let page=1;page<=50;page++){if(Date.now()>deadline)throw Error('Accounting setup timed out safely. Try again.');const r=await request(`${path}${path.includes('?')?'&':'?'}page=${page}&size=100`);if(!Array.isArray(r.data))throw Error('Unexpected accounting response');if(!r.data.length)return all;all.push(...r.data);}throw Error('Accounting list is larger than expected');};
 const companies=await list('/companies'),banks=await list('/companies/123178/bank_accounts');
 const categories=[...await list('/companies/123178/nominal_accounts?account_type=revenue'),...await list('/companies/123178/nominal_accounts?account_type=expense')];
 const taxes=await list('/companies/123178/tax_codes'),currencies=await list('/financial/currencies');
 return pandleMapping({companies,banks,categories,taxes,currencies});
}
const pandleRedirectUri=()=>`${env('SUPABASE_URL')}/functions/v1/far-voucher-api?action=pandle_oauth_callback`;
async function stateName(state:string){
 if(!/^[a-f0-9]{64}$/.test(state))throw Error('Invalid connection state');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state));
 return 'pandle_oauth_state_'+Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
function pandleReturn(result:string){return new Response(null,{status:303,headers:{Location:`${appUrl}?pandle_connection=${result}`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
async function pandleCallback(url:URL){
 let locked=false;
 try{
  const name=await stateName(url.searchParams.get('state')||'');
  const claimed=check(await db.from('far_voucher_connector_state').delete().eq('name',name).select('value'));
  if(claimed?.length!==1||!Number.isFinite(claimed[0].value.expires_at)||claimed[0].value.expires_at<Date.now())return pandleReturn('expired');
  if(url.searchParams.has('error'))return pandleReturn('cancelled');
  const code=url.searchParams.get('code');if(!code||code.length>4096)return pandleReturn('failed');
  const staff=check(await db.from('far_admins').select('role').eq('user_id',claimed[0].value.owner_id).maybeSingle());
  if(!['owner','deputy_manager'].includes(String(staff?.role||'').toLowerCase()))return pandleReturn('failed');
  if(!env('PANDLE_OAUTH_CLIENT_ID')||!env('PANDLE_OAUTH_CLIENT_SECRET'))return pandleReturn('unavailable');
  locked=await rpc('far_voucher_connector_lock');if(!locked)return pandleReturn('busy');
  let auth=await pandleOAuthToken({client_id:env('PANDLE_OAUTH_CLIENT_ID'),client_secret:env('PANDLE_OAUTH_CLIENT_SECRET'),grant_type:'authorization_code',redirect_uri:pandleRedirectUri(),code});
  const {request}=pandleConnection(auth,{clientId:env('PANDLE_OAUTH_CLIENT_ID'),clientSecret:env('PANDLE_OAUTH_CLIENT_SECRET'),save:async(value:any)=>{auth=value;}});
  const mapping=await pandleAccounts(request);
  check(await db.from('far_voucher_connector_state').upsert([{name:'pandle_auth',value:auth},{name:'pandle_mapping',value:mapping},{name:'pandle_health',value:{state:'connected',checked_at:new Date().toISOString()}}]));
  return pandleReturn('connected');
 }catch{return pandleReturn('failed');}
 finally{if(locked)check(await db.from('far_voucher_connector_state').delete().eq('name','pandle_lock'));}
}
async function maintainPandle(force=false){
 const saved=check(await db.from('far_voucher_connector_state').select('value').eq('name','pandle_auth').maybeSingle());
 if(!saved)return;
 const health=check(await db.from('far_voucher_connector_state').select('value').eq('name','pandle_health').maybeSingle());
 if(!force&&health?.value?.checked_at&&Date.now()-Date.parse(health.value.checked_at)<24*3600000)return;
 if(!await rpc('far_voucher_connector_lock'))return;
 try{
  const current=check(await db.from('far_voucher_connector_state').select('value').eq('name','pandle_auth').maybeSingle());
  if(!current)return;
  const {request}=pandleConnection(current.value,{clientId:env('PANDLE_OAUTH_CLIENT_ID'),clientSecret:env('PANDLE_OAUTH_CLIENT_SECRET'),save:async(value:any)=>{check(await db.from('far_voucher_connector_state').upsert({name:'pandle_auth',value}));}});
  await request('/companies?page=1&size=1');
  check(await db.from('far_voucher_connector_state').upsert({name:'pandle_health',value:{state:'connected',checked_at:new Date().toISOString()}}));
 }catch(error){check(await db.from('far_voucher_connector_state').upsert({name:'pandle_health',value:{state:'needs_attention',checked_at:new Date().toISOString(),message:error instanceof Error?error.message:'Pandle needs reconnecting'}}));}
 finally{check(await db.from('far_voucher_connector_state').delete().eq('name','pandle_lock'));}
}
async function runJobs(){
 const jobs=await rpc('far_voucher_claim_jobs',{p_limit:1});
 const results=[];
 for(const job of jobs){
  try{
   const order=await one('far_voucher_orders',job.order_id);
   if(order.status!=='paid')throw Error('Order requires review');
   let external='';
   if(job.kind==='email'){
    if(!emailKey()||!env('EMAIL_FROM'))throw Error('Voucher email delivery is not connected');
    const ticket=await rpc('far_voucher_ticket',{p_token:order.ticket_token});
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${emailKey()}`,'Content-Type':'application/json','Idempotency-Key':`far-voucher-${job.id}`},body:JSON.stringify({from:env('EMAIL_FROM'),to:[order.customer_email],subject:'Your FAR voucher',html:ticketEmail(order,ticket,`${appUrl}?ticket=${order.ticket_token}`)})});
    if(!response.ok)throw Error(`Email delivery failed (${response.status})`);external=(await response.json()).id;
   }else external=await pandle(job,order);
   await update('far_voucher_jobs',job.id,{state:'sent',external_id:external,lease_until:null,last_error:null});results.push({id:job.id,state:'sent'});
  }catch(error){
   const message=error instanceof Error?error.message:'Connection needs attention';
   await update('far_voucher_jobs',job.id,{state:job.attempts>=5?'review':'pending',lease_until:null,next_attempt:new Date(Date.now()+Math.min(60,2**job.attempts)*60000).toISOString(),last_error:message});results.push({id:job.id,state:'queued'});
  }
 }
 return results;
}
async function approvedEmailTest(){
 const name='email_connection_test_20261015';
 const row=check(await db.from('far_voucher_connector_state').select('value').eq('name',name).maybeSingle());
 if(row?.value?.state!=='requested')return;
 // Claim once atomically. An uncertain send is reviewed rather than automatically repeated.
 const claimed=check(await db.from('far_voucher_connector_state').update({value:{state:'processing',started_at:new Date().toISOString()}}).eq('name',name).eq('value->>state','requested').select('name'));
 if(!claimed?.length)return;
 try{
  if(!emailKey()||!env('EMAIL_FROM'))throw Error('Email sender not configured');
  const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${emailKey()}`,'Content-Type':'application/json','Idempotency-Key':name},body:JSON.stringify({from:env('EMAIL_FROM'),to:['fenlandangelsradio@gmail.com'],subject:'TEST ONLY - FAR Voucher Hub email connection',html:'<h1>FAR Voucher Hub - test email</h1><p>This is the single connection test approved by FAR. It is not a voucher, order or payment.</p><p>Voucher sales remain switched off.</p>'})});
  if(!r.ok)throw Error(`Email test failed (${r.status})`);
  const sent=await r.json();
  check(await db.from('far_voucher_connector_state').update({value:{state:'sent',provider_id:sent.id,sent_at:new Date().toISOString()}}).eq('name',name));
 }catch(error){
  check(await db.from('far_voucher_connector_state').update({value:{state:'review',error:error instanceof Error?error.message:'Email test needs review',checked_at:new Date().toISOString()}}).eq('name',name));
 }
}
Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return json({});
 const url=new URL(request.url);const action=url.searchParams.get('action');
 if(request.method==='GET'&&action==='pandle_oauth_callback')return pandleCallback(url);
 if(request.method!=='POST')return json({error:'POST required'},405);
 try{
  if(action==='webhook'){
   const body=await request.json();if(body.event_type!=='CHECKOUT_STATUS_CHANGED'||typeof body.id!=='string')return json({});
   const order=check(await db.from('far_voucher_orders').select('*').eq('checkout_id',body.id).maybeSingle());
   if(order)await reconcile(order);
   return new Response(null,{status:204});
  }
  if(action==='worker'){
   if(!env('WORKER_SECRET')||request.headers.get('Authorization')!==`Bearer ${env('WORKER_SECRET')}`)return json({error:'Access denied'},401);
   const pending=check(await db.from('far_voucher_orders').select('*').in('status',['pending','paid','refund_review']).order('last_checked_at',{ascending:true,nullsFirst:true}).limit(2));
   for(const order of pending){try{await reconcile(order);}catch(error){await update('far_voucher_orders',order.id,{last_checked_at:new Date().toISOString(),last_payment_error:error instanceof Error?error.message:'Payment verification needs attention'});}}
   const jobs=await runJobs();await approvedEmailTest();await maintainPandle();
   check(await db.from('far_voucher_connector_state').upsert({name:'worker_health',value:{last_completed_at:new Date().toISOString(),jobs_processed:jobs.length}}));
   return json({jobs});
  }
  if(request.headers.get('Origin')!==origin)return json({error:'Access denied'},403);
  const input=await request.json();
  if(action==='checkout'){
   if(!env('RATE_LIMIT_SALT'))throw Error('Checkout protection is not configured');
   const source=String(input.email||'').trim().toLowerCase();
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env('RATE_LIMIT_SALT')+source));
   const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   if(!await rpc('far_voucher_rate_limit',{p_key:key}))return json({error:'Too many checkout requests. Please try again in 15 minutes.'},429);
   return json(await checkout(input));
  }
  if(action==='status'){
   const order=check(await db.from('far_voucher_orders').select('*').eq('ticket_token',input.token).maybeSingle());
   if(!order)return json({status:'unknown'});
   if(order.status==='pending'&&order.checkout_id)await reconcile(order);
   return json({status:(await one('far_voucher_orders',order.id)).status});
  }
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return json({error:'Sign in first'},401);
  const userDb=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:`Bearer ${token}`}}});
  const isAdmin=check(await userDb.rpc('far_voucher_is_admin'));if(!isAdmin)return json({error:'Staff access required'},403);
  if(action==='connections'){
   const staff=check(await db.from('far_admins').select('role').eq('user_id',user.id).maybeSingle());
   const management=['owner','deputy_manager'].includes(String(staff?.role||'').toLowerCase());
   if(input.verify&&management)await maintainPandle(true);
   const auth=check(await db.from('far_voucher_connector_state').select('name').eq('name','pandle_auth').maybeSingle());
   const pandleHealth=check(await db.from('far_voucher_connector_state').select('value').eq('name','pandle_health').maybeSingle());
   const health=check(await db.from('far_voucher_connector_state').select('value').eq('name','worker_health').maybeSingle());
   const completed=health?.value?.last_completed_at;
   const result:any={sales:env('SALES_ENABLED')==='true',sumup:!!env('SUMUP_API_KEY')&&!!merchant,email:!!emailKey()&&!!env('EMAIL_FROM'),pandle:env('PANDLE_ENABLED')==='true'&&!!auth&&pandleHealth?.value?.state!=='needs_attention',pandle_session:!!auth,pandle_needs_attention:pandleHealth?.value?.state==='needs_attention',can_configure:management,pandle_oauth_ready:!!env('PANDLE_OAUTH_CLIENT_ID')&&!!env('PANDLE_OAUTH_CLIENT_SECRET'),worker:!!completed&&Date.now()-Date.parse(completed)<300000,worker_last_completed:completed||null};
   if(input.verify){
    if(!management)return json({error:'An owner or deputy manager must check connections'},403);
    const checks=await Promise.allSettled([
     env('SUMUP_API_KEY')?provider('/v0.1/me'):Promise.reject(Error('SumUp key not configured')),
     (async()=>{if(!emailKey())throw Error('Email key not configured');const r=await fetch('https://api.resend.com/domains',{signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${emailKey()}`}});if(!r.ok)throw Error(r.status===401||r.status===403?'Domain lookup unavailable with this key; verify domain in Resend. Sending access is not tested here.':`Email domain check failed (${r.status})`);return r.json();})()
    ]);
    const sumup=checks[0];
    result.sumup_verified=sumup.status==='fulfilled'&&(sumup.value.merchant_profile?.merchant_code||sumup.value.merchant_code)===merchant;
    result.sumup_message=sumup.status==='rejected'?String(sumup.reason?.message||'Connection failed'):result.sumup_verified?'Merchant account verified':'Merchant account does not match';
    const resend=checks[1];
    result.email_domains=resend.status==='fulfilled'?(resend.value.data||[]).filter((d:any)=>d.name==='fenlandangelsradio.co.uk'||d.name.endsWith('.fenlandangelsradio.co.uk')).map((d:any)=>({name:d.name,status:d.status})):[];
    result.email_message=resend.status==='rejected'?String(resend.reason?.message||'Connection failed'):'Email domain check completed';
   }
   return json(result);
  }
  if(action==='pandle_oauth_start'){
   const staff=check(await db.from('far_admins').select('role').eq('user_id',user.id).maybeSingle());
   if(!['owner','deputy_manager'].includes(String(staff?.role||'').toLowerCase()))return json({error:'Owner or deputy manager access required'},403);
   if(!env('PANDLE_OAUTH_CLIENT_ID')||!env('PANDLE_OAUTH_CLIENT_SECRET'))throw Error('Waiting for Pandle to register FAR’s app connection. Your existing account is unchanged.');
   const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
   const name=await stateName(state);
   check(await db.from('far_voucher_connector_state').insert({name,value:{owner_id:user.id,expires_at:Date.now()+10*60000}}));
   const url=new URL('https://my.pandle.com/oauth/authorize');url.search=new URLSearchParams({client_id:env('PANDLE_OAUTH_CLIENT_ID'),redirect_uri:pandleRedirectUri(),response_type:'code',state}).toString();
   return json({url:url.href});
  }
  if(action==='pandle_connect'){
   const staff=check(await db.from('far_admins').select('role').eq('user_id',user.id).maybeSingle());
   if(!['owner','deputy_manager'].includes(String(staff?.role||'').toLowerCase()))return json({error:'Owner or deputy manager access required'},403);
   const email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');
   if(!email||!password||email.length>200||password.length>512)throw Error('Enter your Pandle email and password');
   if(!await rpc('far_voucher_connector_lock'))throw Error('Accounting connection is busy. Try again shortly.');
   try{
    let auth=await pandleSession(email,password);delete input.password;
    const {request}=pandleConnection(auth,{save:async(value:any)=>{auth=value;}});
    const mapping=await pandleAccounts(request);
    check(await db.from('far_voucher_connector_state').upsert([{name:'pandle_auth',value:auth},{name:'pandle_mapping',value:mapping},{name:'pandle_health',value:{state:'connected',checked_at:new Date().toISOString()}}]));
    return json({connected:true,message:'Pandle API access and FAR account mappings verified. Posting remains disabled until the final accounting checks.'});
   }finally{delete input.password;check(await db.from('far_voucher_connector_state').delete().eq('name','pandle_lock'));}
  }
  if(action==='review_order'){
   const staff=check(await db.from('far_admins').select('role').eq('user_id',user.id).maybeSingle());
   if(!['owner','deputy_manager'].includes(String(staff?.role||'').toLowerCase()))return json({error:'Owner or deputy manager access required'},403);
   const order=await one('far_voucher_orders',input.id);
   if(input.mode==='check'){await reconcile(order);return json({message:'Payment status checked directly with SumUp.'});}
   if(input.mode==='release'){
    if(order.status!=='refund_review'||order.review_source!=='staff_hold')throw Error('Only a staff review pause can be released');
    const checkout=await provider(`/v0.1/checkouts/${encodeURIComponent(order.checkout_id)}`);
    if(checkout.status!=='PAID')throw Error('SumUp has not confirmed a valid payment. The voucher remains paused.');
    const transaction=await provider(`/v2.1/merchants/${encodeURIComponent(merchant)}/transactions?id=${encodeURIComponent(checkout.transaction_id)}`);
    if(!verifyPayment(order,checkout,transaction,merchant))throw Error('Payment could not be verified. The voucher remains paused.');
    return json(await rpc('far_voucher_review_hold',{p_order:order.id,p_actor:user.id,p_release:true}));
   }
   if(input.mode==='hold')return json(await rpc('far_voucher_review_hold',{p_order:order.id,p_actor:user.id,p_release:false}));
   throw Error('Choose a valid review action');
  }
  if(action==='invite'){
   const email=String(input.email||'').trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Valid business email required');
   const member=check(await db.from('far_voucher_members').select('email').eq('business_id',input.business).eq('email',email).maybeSingle());
   if(!member)throw Error('Approve this email for the business first');
   const result=await db.auth.admin.inviteUserByEmail(email,{redirectTo:appUrl});
   if(result.error){if(result.error.code==='email_exists'||result.error.message.toLowerCase().includes('already'))return json({existing:true});throw Error('Invitation could not be sent. Check email delivery settings.');}
   return json({invited:true});
  }
  if(action==='retry'){
   const job=await one('far_voucher_jobs',input.id);
   if(job.state==='processing')throw Error('This task is already running');
   await update('far_voucher_jobs',job.id,{state:'pending',next_attempt:new Date().toISOString()});
   return json({queued:true});
  }
  return json({error:'Unknown action'},400);
 }catch(error){return json({error:error instanceof Error?error.message:'Please try again'},400);}
});
