export function pandleMapping({companies,banks,categories,taxes,currencies}){
 const only=(items,test,label)=>{const matches=items.filter(test);if(matches.length!==1)throw Error(`${label} could not be identified safely`);return matches[0];};
 const company=only(companies,r=>String(r.id)==='123178'&&r.attributes?.['company-name']?.toLowerCase()==='bastone major group ltd','FAR legal company');
 if(company.attributes['vat-registered']!==false)throw Error('The accounting connection requires a confirmed non-VAT company');
 const bank=only(banks,r=>String(r.id)==='367099'&&r.attributes?.name==='FAR - SumUp Payment Clearing','FAR clearing account');
 const sales=only(categories,r=>String(r.attributes?.['nominal-code'])==='420'&&r.attributes?.name==='FAR - Voucher Sales'&&!r.attributes?.inactive,'FAR voucher sales category');
 const fees=only(categories,r=>String(r.attributes?.['nominal-code'])==='505'&&r.attributes?.name==='FAR - SumUp Processing Fees'&&!r.attributes?.inactive,'FAR SumUp fees category');
 const tax=only(taxes,r=>r.attributes?.taxcode==='NV'&&Number(r.attributes?.['tax-rate'])===0,'No VAT tax code');
 const gbp=only(currencies,r=>r.attributes?.['currency-code']==='GBP','Pound sterling currency');
 const mapping={company:Number(company.id),bank:Number(bank.id),sales:Number(sales.id),fees:Number(fees.id),noVat:Number(tax.id),gbp:Number(gbp.id)};
 if(Object.values(mapping).some(id=>!Number.isSafeInteger(id)||id<=0))throw Error('Accounting returned an invalid record ID');
 return mapping;
}
export async function pandleSession(email,password,fetcher=fetch){
 const response=await fetcher('https://my.pandle.com/api/v1/auth/sign_in',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({email,password})});
 if(!response.ok)throw Error(`Pandle API sign-in was not accepted (${response.status}). Check API access and your login.`);
 const auth=Object.fromEntries(['access-token','client','uid','expiry'].map(k=>[k,response.headers.get(k)]).filter(([,v])=>v));
 if(!auth['access-token']||!auth.client||!auth.uid)throw Error('Pandle did not return an API session. API access may need enabling.');
 return auth;
}
export async function pandleOAuthToken(parameters,fetcher=fetch){
 const response=await fetcher('https://my.pandle.com/oauth/token',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams(parameters).toString()});
 if(!response.ok)throw Error(`Pandle authorisation failed (${response.status})`);
 const token=await response.json();
 if(typeof token.access_token!=='string'||!token.access_token||token.token_type?.toLowerCase()!=='bearer')throw Error('Pandle returned an incomplete authorisation');
 const lifetime=Number(token.expires_in);
 return {kind:'oauth',access_token:token.access_token,refresh_token:typeof token.refresh_token==='string'?token.refresh_token:null,expires_at:Number.isFinite(lifetime)&&lifetime>0?Date.now()+lifetime*1000:null};
}
export function pandleConnection(initial,{clientId='',clientSecret='',save=async()=>{},fetcher=fetch}={}){
 let auth={...initial};
 const oauth=auth.kind==='oauth';
 if(oauth?!auth.access_token:!auth['access-token']||!auth.client||!auth.uid)throw Error('Pandle authentication missing');
 const refresh=async()=>{
  if(!auth.refresh_token||!clientId||!clientSecret)throw Error('Pandle needs reconnecting');
  const token=await pandleOAuthToken({client_id:clientId,client_secret:clientSecret,grant_type:'refresh_token',refresh_token:auth.refresh_token},fetcher);
  auth={...token,refresh_token:token.refresh_token||auth.refresh_token};await save(auth);
 };
 const request=async(path,init={},retried=false)=>{
  if(!path.startsWith('/')||path.startsWith('//'))throw Error('Invalid Pandle API path');
  if(oauth&&auth.expires_at&&auth.expires_at<Date.now()+60000)await refresh();
  const headers=oauth?{Authorization:`Bearer ${auth.access_token}`}:{...auth};
  const response=await fetcher('https://my.pandle.com/api/v1'+path,{...init,signal:AbortSignal.timeout(20000),headers:{...headers,'Content-Type':'application/json',Accept:'application/json'}});
  if(!oauth&&response.headers.get('access-token')){
   auth={...auth,...Object.fromEntries(['access-token','client','uid','expiry'].map(k=>[k,response.headers.get(k)]).filter(([,value])=>value))};await save(auth);
  }
  // Only a read is retried after rejected authentication. Financial writes are never blindly repeated.
  if(oauth&&response.status===401&&!retried&&(!init.method||init.method==='GET')&&auth.refresh_token){await refresh();return request(path,init,true);}
  if(!response.ok)throw Error(`Pandle request failed (${response.status})`);
  return response.json();
 };
 return {request};
}
