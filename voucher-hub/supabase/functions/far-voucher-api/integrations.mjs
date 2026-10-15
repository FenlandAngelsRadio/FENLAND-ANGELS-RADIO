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
