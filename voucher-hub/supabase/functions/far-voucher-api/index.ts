import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {minor,verifyPayment,bankEntry,ticketEmail,isReversed} from './core.mjs';
import {pandleMapping,pandleSession} from './integrations.mjs';

const env=(name:string)=>Deno.env.get(name)||'';
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const origin=env('APP_ORIGIN')||'https://fenlandangelsradio.co.uk';
const appUrl=env('APP_URL')||'https://fenlandangelsradio.co.uk/voucher-app.html';
const merchant=env('SUMUP_MERCHANT_CODE');
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
  let auth=saved?.value||JSON.parse(env('PANDLE_AUTH_JSON'));
  if(!auth['access-token']||!auth.client||!auth.uid)throw Error('Pandle authentication missing');
  const request=async(path:string,init:RequestInit={})=>{
   const response=await fetch('https://my.pandle.com/api/v1'+path,{...init,signal:AbortSignal.timeout(20000),headers:{...auth,'Content-Type':'application/json','Accept':'application/json'}});
   const rotated=response.headers.get('access-token');
   if(rotated){auth={...auth,'access-token':rotated,client:response.headers.get('client')||auth.client,uid:response.headers.get('uid')||auth.uid};check(await db.from('far_voucher_connector_state').upsert({name:'pandle_auth',value:auth}));}
   if(!response.ok)throw Error(`Pandle request failed (${response.status})`);
   return response.json();
  };
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
async function runJobs(){
 const jobs=await rpc('far_voucher_claim_jobs',{p_limit:1});
 const results=[];
 for(const job of jobs){
  try{
   const order=await one('far_voucher_orders',job.order_id);
   if(order.status!=='paid')throw Error('Order requires review');
   let external='';
   if(job.kind==='email'){
    if(!env('RESEND_API_KEY')||!env('EMAIL_FROM'))throw Error('Voucher email delivery is not connected');
    const ticket=await rpc('far_voucher_ticket',{p_token:order.ticket_token});
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env('RESEND_API_KEY')}`,'Content-Type':'application/json','Idempotency-Key':`far-voucher-${job.id}`},body:JSON.stringify({from:env('EMAIL_FROM'),to:[order.customer_email],subject:'Your FAR voucher',html:ticketEmail(order,ticket,`${appUrl}?ticket=${order.ticket_token}`)})});
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
Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return json({});
 if(request.method!=='POST')return json({error:'POST required'},405);
 const url=new URL(request.url);const action=url.searchParams.get('action');
 try{
  if(action==='webhook'){
   const body=await request.json();if(body.event_type!=='CHECKOUT_STATUS_CHANGED'||typeof body.id!=='string')return json({});
   const order=check(await db.from('far_voucher_orders').select('*').eq('checkout_id',body.id).maybeSingle());
   if(order)await reconcile(order);
   return new Response(null,{status:204});
  }
  if(action==='worker'){
   if(!env('WORKER_SECRET')||request.headers.get('Authorization')!==`Bearer ${env('WORKER_SECRET')}`)return json({error:'Access denied'},401);
   const pending=check(await db.from('far_voucher_orders').select('*').in('status',['pending','paid']).order('last_checked_at',{ascending:true,nullsFirst:true}).limit(2));
   for(const order of pending){try{await reconcile(order);}catch(error){await update('far_voucher_orders',order.id,{last_checked_at:new Date().toISOString(),last_payment_error:error instanceof Error?error.message:'Payment verification needs attention'});}}
   return json({jobs:await runJobs()});
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
   const auth=check(await db.from('far_voucher_connector_state').select('name').eq('name','pandle_auth').maybeSingle());
   const result:any={sales:env('SALES_ENABLED')==='true',sumup:!!env('SUMUP_API_KEY')&&!!merchant,email:!!env('RESEND_API_KEY')&&!!env('EMAIL_FROM'),pandle:env('PANDLE_ENABLED')==='true',pandle_session:!!auth,can_configure:management};
   if(input.verify){
    if(!management)return json({error:'An owner or deputy manager must check connections'},403);
    const checks=await Promise.allSettled([
     env('SUMUP_API_KEY')?provider('/v0.1/me'):Promise.reject(Error('SumUp key not configured')),
     (async()=>{if(!env('RESEND_API_KEY'))throw Error('Email key not configured');const r=await fetch('https://api.resend.com/domains',{signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env('RESEND_API_KEY')}`}});if(!r.ok)throw Error(`Email domain check failed (${r.status})`);return r.json();})()
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
  if(action==='pandle_connect'){
   const staff=check(await db.from('far_admins').select('role').eq('user_id',user.id).maybeSingle());
   if(!['owner','deputy_manager'].includes(String(staff?.role||'').toLowerCase()))return json({error:'Owner or deputy manager access required'},403);
   const email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');
   if(!email||!password||email.length>200||password.length>512)throw Error('Enter your Pandle email and password');
   if(!await rpc('far_voucher_connector_lock'))throw Error('Accounting connection is busy. Try again shortly.');
   try{
    let auth=await pandleSession(email,password);delete input.password;
    const get=async(path:string)=>{
     const r=await fetch('https://my.pandle.com/api/v1'+path,{signal:AbortSignal.timeout(15000),headers:{...auth,Accept:'application/json'}});
     if(r.headers.get('access-token'))auth={...auth,'access-token':r.headers.get('access-token'),client:r.headers.get('client')||auth.client,uid:r.headers.get('uid')||auth.uid,expiry:r.headers.get('expiry')||auth.expiry};
     if(!r.ok)throw Error(`Pandle API access check failed (${r.status})`);return r.json();
    };
    const deadline=Date.now()+65000;
    const list=async(path:string)=>{const all=[];for(let page=1;page<=50;page++){if(Date.now()>deadline)throw Error('Accounting setup timed out safely. Try again.');const r=await get(`${path}${path.includes('?')?'&':'?'}page=${page}&size=100`);if(!Array.isArray(r.data))throw Error('Unexpected accounting response');if(!r.data.length)return all;all.push(...r.data);}throw Error('Accounting list is larger than expected');};
    const companies=await list('/companies'),banks=await list('/companies/123178/bank_accounts');
    const categories=[...await list('/companies/123178/nominal_accounts?account_type=revenue'),...await list('/companies/123178/nominal_accounts?account_type=expense')];
    const taxes=await list('/companies/123178/tax_codes'),currencies=await list('/financial/currencies');
    const mapping=pandleMapping({companies,banks,categories,taxes,currencies});
    check(await db.from('far_voucher_connector_state').upsert([{name:'pandle_auth',value:auth},{name:'pandle_mapping',value:mapping}]));
    return json({connected:true,message:'Pandle API access and FAR account mappings verified. Posting remains disabled until the final accounting checks.'});
   }finally{delete input.password;check(await db.from('far_voucher_connector_state').delete().eq('name','pandle_lock'));}
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
